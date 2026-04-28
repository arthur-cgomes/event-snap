import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Payment } from './entity/payment.entity';
import { PaymentStatus } from './enum/payment-status.enum';
import { QrCode } from '../qrcode/entity/qrcode.entity';
import { QrCodeType } from '../../common/enum/qrcode-type.enum';
import { QrCodePlan } from '../../common/enum/qrcode-plan.enum';
import { User } from '../user/entity/user.entity';
import { APP_CONSTANTS } from '../../common/constants';
import { CacheService } from '../../common/services/cache.service';
import { DispatcherEmailService } from '../dispatcher-email/dispatcher-email.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private _stripe: Stripe | undefined;

  private get stripe(): Stripe {
    const key = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY não configurada');
    }
    if (!this._stripe) {
      this._stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' });
    }
    return this._stripe;
  }

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(QrCode)
    private readonly qrCodeRepository: Repository<QrCode>,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly dispatcherEmailService: DispatcherEmailService,
  ) {}

  async createCheckoutSession(
    qrCodeId: string,
    user: User,
    plan: QrCodePlan = QrCodePlan.PARTY,
  ): Promise<{ sessionId: string; url: string }> {
    const qrCode = await this.qrCodeRepository.findOne({
      where: { id: qrCodeId },
      relations: ['user'],
    });

    if (!qrCode) {
      throw new NotFoundException('QR Code não encontrado');
    }

    if (qrCode.user?.id !== user.id) {
      throw new BadRequestException(
        'Você não tem permissão para atualizar este QR Code',
      );
    }

    if (qrCode.type === QrCodeType.PAID) {
      throw new BadRequestException('Este QR Code já é Premium');
    }

    const existingPayment = await this.paymentRepository.findOne({
      where: {
        qrCode: { id: qrCodeId },
        status: PaymentStatus.PENDING,
      },
    });

    if (existingPayment) {
      try {
        const existingSession = await this.stripe.checkout.sessions.retrieve(
          existingPayment.stripeSessionId,
        );
        if (existingSession.status === 'open' && existingSession.url) {
          return {
            sessionId: existingSession.id,
            url: existingSession.url,
          };
        }
      } catch {}
      existingPayment.status = PaymentStatus.FAILED;
      await this.paymentRepository.save(existingPayment);
    }

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'localhost:3001';

    const { priceInCents, description } = this.getPriceAndDetailsForPlan(plan);

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: `FotoUai ${plan} — ${qrCode.eventName || 'Evento'}`,
              description: description,
            },
            unit_amount: priceInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        qrCodeId: qrCode.id,
        userId: user.id,
        plan: plan,
      },
      success_url: `${frontendUrl}/#/dashboard?payment=success&qrCodeId=${qrCode.id}`,
      cancel_url: `${frontendUrl}/#/dashboard?payment=cancelled&qrCodeId=${qrCode.id}`,
    });

    const payment = this.paymentRepository.create({
      stripeSessionId: session.id,
      amount: priceInCents,
      currency: 'brl',
      status: PaymentStatus.PENDING,
      user: { id: user.id } as User,
      qrCode: { id: qrCode.id } as QrCode,
    });

    await this.paymentRepository.save(payment);

    this.logger.log(
      `Checkout session created: ${session.id} for QR Code: ${qrCodeId} (plan: ${plan})`,
    );

    return { sessionId: session.id, url: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadRequestException('Invalid webhook signature');
    }

    this.logger.log(`Webhook received: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case 'checkout.session.expired':
        await this.handleCheckoutExpired(
          event.data.object as Stripe.Checkout.Session,
        );
        break;

      case 'charge.refunded':
        await this.handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  private async handleCheckoutCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { stripeSessionId: session.id },
      relations: ['qrCode', 'user'],
    });

    if (!payment) {
      this.logger.warn(`Payment not found for session: ${session.id}`);
      return;
    }

    payment.status = PaymentStatus.COMPLETED;
    payment.stripePaymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || null;
    payment.paymentMethod = session.payment_method_types?.[0] || 'card';
    payment.paidAt = new Date();
    await this.paymentRepository.save(payment);

    const qrCode = await this.qrCodeRepository.findOne({
      where: { id: payment.qrCode.id },
    });

    if (qrCode) {
      qrCode.type = QrCodeType.PAID;

      const plan = this.getPlanFromAmount(payment.amount);
      qrCode.plan = plan;

      const newExpiration = new Date();
      const expirationDays = this.getExpirationDaysForPlan(plan);
      newExpiration.setDate(newExpiration.getDate() + expirationDays);
      qrCode.expirationDate = newExpiration;
      await this.qrCodeRepository.save(qrCode);

      await this.cacheService.del(`qrcode:id:${qrCode.id}`);
      await this.cacheService.del(`qrcode:token:${qrCode.token}`);
      await this.cacheService.delByPattern(`qrcode:user:*`);

      this.logger.log(
        `QR Code ${qrCode.id} upgraded to PAID (plan: ${plan}, expires: ${newExpiration.toISOString()})`,
      );

      if (payment.user?.email) {
        try {
          const amountFormatted = (payment.amount / 100)
            .toFixed(2)
            .replace('.', ',');
          await this.dispatcherEmailService.sendEmail(
            payment.user.email,
            'FotoUai — Pagamento confirmado!',
            `Olá ${payment.user.name || ''}! Seu pagamento de R$${amountFormatted} foi confirmado. O evento "${qrCode.eventName || 'Seu Evento'}" agora é ${plan} e aceita fotos e vídeos até ${newExpiration.toLocaleDateString('pt-BR')}.`,
            this.buildPaymentConfirmationHtml(
              payment.user.name || '',
              amountFormatted,
              qrCode.eventName || 'Seu Evento',
              newExpiration,
              plan,
            ),
          );
        } catch (emailErr: unknown) {
          this.logger.error(
            `Failed to send payment confirmation email: ${emailErr instanceof Error ? emailErr.message : String(emailErr)}`,
          );
        }
      }
    }
  }

  private buildPaymentConfirmationHtml(
    userName: string,
    amount: string,
    eventName: string,
    expiresAt: Date,
    plan: QrCodePlan = QrCodePlan.PARTY,
  ): string {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'localhost:3001';
    const planDescription = this.getPlanDescriptionForEmail(plan);
    const planLabel =
      plan === QrCodePlan.PARTY
        ? 'Festa'
        : plan === QrCodePlan.CORPORATE
          ? 'Corporativo'
          : plan;
    return `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
        <div style="background: linear-gradient(135deg, #8B5CF6, #6D28D9); padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">FotoUai</h1>
          <p style="color: #E9D5FF; margin: 8px 0 0; font-size: 14px;">Pagamento Confirmado</p>
        </div>
        <div style="padding: 32px 24px;">
          <p style="font-size: 16px; color: #1f2937; margin: 0 0 16px;">Olá <strong>${userName}</strong>,</p>
          <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 24px;">
            Seu pagamento de <strong>R$${amount}</strong> foi processado com sucesso!
          </p>
          <div style="background: #F5F3FF; border-radius: 8px; padding: 16px; margin: 0 0 24px;">
            <p style="font-size: 13px; color: #6D28D9; margin: 0 0 8px; font-weight: 600;">Detalhes do upgrade:</p>
            <p style="font-size: 14px; color: #4b5563; margin: 0 0 4px;">Evento: <strong>${eventName}</strong></p>
            <p style="font-size: 14px; color: #4b5563; margin: 0 0 4px;">Plano: <strong>${planLabel}</strong></p>
            <p style="font-size: 14px; color: #4b5563; margin: 0 0 4px;">Válido até: <strong>${expiresAt.toLocaleDateString('pt-BR')}</strong></p>
          </div>
          <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 24px;">
            ${planDescription}
          </p>
          <div style="text-align: center;">
            <a href="${frontendUrl}/#/dashboard" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6, #6D28D9); color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
              Ver no Dashboard
            </a>
          </div>
        </div>
        <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">© ${new Date().getFullYear()} FotoUai — Suas memórias, compartilhadas com facilidade.</p>
        </div>
      </div>
    `;
  }

  private getPriceAndDetailsForPlan(plan: QrCodePlan): {
    priceInCents: number;
    description: string;
    daysValid: number;
  } {
    switch (plan) {
      case QrCodePlan.PARTY:
        return {
          priceInCents: APP_CONSTANTS.PARTY_PRICE_CENTS,
          description: `Plano Party: 100 uploads, ${APP_CONSTANTS.PARTY_EXPIRATION_DAYS} dias`,
          daysValid: APP_CONSTANTS.PARTY_EXPIRATION_DAYS,
        };
      case QrCodePlan.CORPORATE:
        return {
          priceInCents: APP_CONSTANTS.CORPORATE_PRICE_CENTS,
          description: `Plano Corporate: uploads ilimitados, ${APP_CONSTANTS.CORPORATE_EXPIRATION_DAYS} dias`,
          daysValid: APP_CONSTANTS.CORPORATE_EXPIRATION_DAYS,
        };
      default:
        return {
          priceInCents: APP_CONSTANTS.PARTY_PRICE_CENTS,
          description: `Plano Party: 100 uploads, ${APP_CONSTANTS.PARTY_EXPIRATION_DAYS} dias`,
          daysValid: APP_CONSTANTS.PARTY_EXPIRATION_DAYS,
        };
    }
  }

  private getPlanFromAmount(amountCents: number): QrCodePlan {
    if (amountCents === APP_CONSTANTS.CORPORATE_PRICE_CENTS) {
      return QrCodePlan.CORPORATE;
    }
    return QrCodePlan.PARTY;
  }

  private getExpirationDaysForPlan(plan: QrCodePlan): number {
    switch (plan) {
      case QrCodePlan.FREE:
        return APP_CONSTANTS.QR_CODE_EXPIRATION_DAYS;
      case QrCodePlan.PARTY:
        return APP_CONSTANTS.PARTY_EXPIRATION_DAYS;
      case QrCodePlan.CORPORATE:
        return APP_CONSTANTS.CORPORATE_EXPIRATION_DAYS;
      default:
        return APP_CONSTANTS.QR_CODE_EXPIRATION_DAYS;
    }
  }

  private getPlanDescriptionForEmail(plan: QrCodePlan): string {
    switch (plan) {
      case QrCodePlan.PARTY:
        return `Seu evento agora é FESTA com até 100 fotos/vídeos e duração de ${APP_CONSTANTS.PARTY_EXPIRATION_DAYS} dias. Aproveite!`;
      case QrCodePlan.CORPORATE:
        return `Seu evento agora é CORPORATIVO com fotos/vídeos ilimitados e duração de ${APP_CONSTANTS.CORPORATE_EXPIRATION_DAYS} dias. Aproveite!`;
      default:
        return 'Seu evento agora é PREMIUM. Aproveite!';
    }
  }

  private async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;

    if (!paymentIntentId) {
      this.logger.warn('Charge refunded webhook missing payment_intent');
      return;
    }

    const payment = await this.paymentRepository.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
      relations: ['qrCode'],
    });

    if (!payment) {
      this.logger.warn(
        `Payment not found for refunded charge PI: ${paymentIntentId}`,
      );
      return;
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      this.logger.log(`Payment ${payment.id} already marked as REFUNDED`);
      return;
    }

    payment.status = PaymentStatus.REFUNDED;
    await this.paymentRepository.save(payment);

    this.logger.log(
      `Payment ${payment.id} marked as REFUNDED via webhook (charge: ${charge.id})`,
    );
  }

  private async handleCheckoutExpired(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const payment = await this.paymentRepository.findOne({
      where: { stripeSessionId: session.id },
    });

    if (payment && payment.status === PaymentStatus.PENDING) {
      payment.status = PaymentStatus.FAILED;
      await this.paymentRepository.save(payment);
      this.logger.log(`Payment expired for session: ${session.id}`);
    }
  }

  async getPaymentStatus(
    qrCodeId: string,
    _user: User,
  ): Promise<{
    isPaid: boolean;
    status: PaymentStatus | null;
    paidAt: Date | null;
  }> {
    const payment = await this.paymentRepository.findOne({
      where: {
        qrCode: { id: qrCodeId },
        status: PaymentStatus.COMPLETED,
      },
      relations: ['qrCode'],
    });

    if (!payment) {
      return { isPaid: false, status: null, paidAt: null };
    }

    return {
      isPaid: true,
      status: payment.status,
      paidAt: payment.paidAt,
    };
  }

  async requestRefund(
    paymentId: string,
    user: User,
    reason?: string,
  ): Promise<{ refundId: string; status: string; amount: number }> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
      relations: ['qrCode', 'user'],
    });

    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    if (payment.user?.id !== user.id) {
      throw new BadRequestException(
        'Você não tem permissão para solicitar reembolso deste pagamento',
      );
    }

    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException(
        'Apenas pagamentos concluídos podem ser reembolsados',
      );
    }

    if (!payment.stripePaymentIntentId) {
      throw new BadRequestException(
        'Pagamento sem referência Stripe para reembolso',
      );
    }

    try {
      const refund = await this.stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        reason: 'requested_by_customer',
        metadata: {
          paymentId: payment.id,
          userId: user.id,
          userReason: reason || 'Não informado',
        },
      });

      payment.status = PaymentStatus.REFUNDED;
      await this.paymentRepository.save(payment);

      // Revert QR code to FREE
      if (payment.qrCode) {
        const qrCode = await this.qrCodeRepository.findOne({
          where: { id: payment.qrCode.id },
        });

        if (qrCode) {
          qrCode.type = QrCodeType.FREE;
          qrCode.plan = QrCodePlan.FREE;

          const freeExpiration = new Date();
          freeExpiration.setDate(
            freeExpiration.getDate() + APP_CONSTANTS.QR_CODE_EXPIRATION_DAYS,
          );
          qrCode.expirationDate = freeExpiration;
          await this.qrCodeRepository.save(qrCode);

          await this.cacheService.del(`qrcode:id:${qrCode.id}`);
          await this.cacheService.del(`qrcode:token:${qrCode.token}`);
          await this.cacheService.delByPattern(`qrcode:user:*`);
        }
      }

      // Send refund confirmation email
      if (payment.user?.email) {
        try {
          const amountFormatted = (payment.amount / 100)
            .toFixed(2)
            .replace('.', ',');
          await this.dispatcherEmailService.sendEmail(
            payment.user.email,
            'FotoUai — Reembolso processado',
            `Olá ${payment.user.name || ''}! Seu reembolso de R$${amountFormatted} foi processado com sucesso. O valor será estornado na sua forma de pagamento original em até 10 dias úteis.`,
            this.buildRefundConfirmationHtml(
              payment.user.name || '',
              amountFormatted,
              payment.qrCode?.eventName || 'Seu Evento',
            ),
          );
        } catch (emailErr: unknown) {
          this.logger.error(
            `Failed to send refund confirmation email: ${emailErr instanceof Error ? emailErr.message : String(emailErr)}`,
          );
        }
      }

      this.logger.log(
        `Refund processed: ${refund.id} for payment: ${paymentId} (amount: ${payment.amount})`,
      );

      return {
        refundId: refund.id,
        status: refund.status,
        amount: payment.amount,
      };
    } catch (err: unknown) {
      this.logger.error(
        `Stripe refund failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new BadRequestException(
        'Falha ao processar reembolso. Tente novamente.',
      );
    }
  }

  private buildRefundConfirmationHtml(
    userName: string,
    amount: string,
    eventName: string,
  ): string {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'localhost:3001';
    return `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
        <div style="background: linear-gradient(135deg, #8B5CF6, #6D28D9); padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">FotoUai</h1>
          <p style="color: #E9D5FF; margin: 8px 0 0; font-size: 14px;">Reembolso Processado</p>
        </div>
        <div style="padding: 32px 24px;">
          <p style="font-size: 16px; color: #1f2937; margin: 0 0 16px;">Olá <strong>${userName}</strong>,</p>
          <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 24px;">
            Seu reembolso de <strong>R$${amount}</strong> referente ao evento "<strong>${eventName}</strong>" foi processado com sucesso.
          </p>
          <div style="background: #FEF2F2; border-radius: 8px; padding: 16px; margin: 0 0 24px;">
            <p style="font-size: 13px; color: #991B1B; margin: 0 0 8px; font-weight: 600;">Informações do reembolso:</p>
            <p style="font-size: 14px; color: #4b5563; margin: 0 0 4px;">Valor: <strong>R$${amount}</strong></p>
            <p style="font-size: 14px; color: #4b5563; margin: 0 0 4px;">Prazo: <strong>Até 10 dias úteis</strong></p>
            <p style="font-size: 14px; color: #4b5563; margin: 0;">O evento retornou ao plano Grátis.</p>
          </div>
          <div style="text-align: center;">
            <a href="${frontendUrl}/#/dashboard" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6, #6D28D9); color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
              Ver no Dashboard
            </a>
          </div>
        </div>
        <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">© ${new Date().getFullYear()} FotoUai — Suas memórias, compartilhadas com facilidade.</p>
        </div>
      </div>
    `;
  }

  async getPaymentHistory(user: User): Promise<any[]> {
    const payments = await this.paymentRepository.find({
      where: { user: { id: user.id } },
      relations: ['qrCode'],
      order: { createdAt: 'DESC' },
    });
    return payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      paymentMethod: p.paymentMethod,
      paidAt: p.paidAt,
      createdAt: p.createdAt,
      eventName: p.qrCode?.eventName || 'Evento',
      plan: p.qrCode?.plan || 'FREE',
    }));
  }
}

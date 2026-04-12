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
import { User } from '../user/entity/user.entity';
import { APP_CONSTANTS } from '../../common/constants';
import { CacheService } from '../../common/services/cache.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly stripe: Stripe;

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(QrCode)
    private readonly qrCodeRepository: Repository<QrCode>,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly emailService: EmailService,
  ) {
    this.stripe = new Stripe(
      this.configService.get<string>('STRIPE_SECRET_KEY'),
      { apiVersion: '2025-02-24.acacia' },
    );
  }

  async createCheckoutSession(
    qrCodeId: string,
    user: User,
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
      this.configService.get<string>('FRONTEND_URL') ||
      'https://fotouai.up.railway.app';

    const priceInCents = APP_CONSTANTS.PREMIUM_PRICE_CENTS;

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: `FotoUai Premium — ${qrCode.eventName || 'Evento'}`,
              description:
                'Evento Premium: fotos e vídeos ilimitados por 30 dias',
            },
            unit_amount: priceInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        qrCodeId: qrCode.id,
        userId: user.id,
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
      `Checkout session created: ${session.id} for QR Code: ${qrCodeId}`,
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
      const newExpiration = new Date();
      newExpiration.setDate(
        newExpiration.getDate() + APP_CONSTANTS.PREMIUM_EXPIRATION_DAYS,
      );
      qrCode.expirationDate = newExpiration;
      await this.qrCodeRepository.save(qrCode);

      await this.cacheService.del(`qrcode:id:${qrCode.id}`);
      await this.cacheService.del(`qrcode:token:${qrCode.token}`);
      await this.cacheService.delByPattern(`qrcode:user:*`);

      this.logger.log(
        `QR Code ${qrCode.id} upgraded to PAID (expires: ${newExpiration.toISOString()})`,
      );

      if (payment.user?.email) {
        try {
          const amountFormatted = (payment.amount / 100)
            .toFixed(2)
            .replace('.', ',');
          await this.emailService.sendEmail(
            payment.user.email,
            'FotoUai — Pagamento confirmado!',
            `Olá ${payment.user.name || ''}! Seu pagamento de R$${amountFormatted} foi confirmado. O evento "${qrCode.eventName || 'Seu Evento'}" agora é Premium e aceita fotos e vídeos ilimitados até ${newExpiration.toLocaleDateString('pt-BR')}.`,
            this.buildPaymentConfirmationHtml(
              payment.user.name || '',
              amountFormatted,
              qrCode.eventName || 'Seu Evento',
              newExpiration,
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
  ): string {
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
            <p style="font-size: 14px; color: #4b5563; margin: 0;">Válido até: <strong>${expiresAt.toLocaleDateString('pt-BR')}</strong></p>
          </div>
          <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0;">
            Seu evento agora aceita fotos e vídeos ilimitados. Aproveite!
          </p>
        </div>
        <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">FotoUai — Suas memórias, compartilhadas com facilidade.</p>
        </div>
      </div>
    `;
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
}

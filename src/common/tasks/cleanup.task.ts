import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, Between } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { QrCode } from '../../modules/qrcode/entity/qrcode.entity';
import { Upload } from '../../modules/upload/entity/upload.entity';
import { subDays, addHours } from 'date-fns';
import { DispatcherEmailService } from '../../modules/dispatcher-email/dispatcher-email.service';

@Injectable()
export class CleanupTask {
  private readonly logger = new Logger(CleanupTask.name);

  constructor(
    @InjectRepository(QrCode)
    private readonly qrCodeRepository: Repository<QrCode>,
    @InjectRepository(Upload)
    private readonly uploadRepository: Repository<Upload>,
    private readonly dispatcherEmailService: DispatcherEmailService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredQrCodes() {
    try {
      const thirtyDaysAgo = subDays(new Date(), 30);

      const result = await this.qrCodeRepository
        .createQueryBuilder()
        .update(QrCode)
        .set({
          active: false,
          deletedAt: new Date(),
        })
        .where('"expiration_date" < :thirtyDaysAgo', { thirtyDaysAgo })
        .andWhere('deletedAt IS NULL')
        .andWhere('active = true')
        .execute();

      this.logger.log(
        `Cleaned up ${result.affected || 0} expired QR codes (older than 30 days)`,
      );
    } catch (error) {
      this.logger.error('Error cleaning up expired QR codes:', error);
    }
  }

  @Cron(CronExpression.EVERY_WEEK)
  async cleanupOrphanedUploads() {
    try {
      const orphanedUploads = await this.uploadRepository
        .createQueryBuilder('upload')
        .leftJoinAndSelect('upload.qrCode', 'qrCode')
        .where('qrCode.deletedAt IS NOT NULL')
        .andWhere('upload.deletedAt IS NULL')
        .getMany();

      if (orphanedUploads.length > 0) {
        const uploadIds = orphanedUploads.map((u) => u.id);

        await this.uploadRepository
          .createQueryBuilder()
          .update(Upload)
          .set({ deletedAt: new Date() })
          .whereInIds(uploadIds)
          .execute();

        this.logger.log(
          `Cleaned up ${orphanedUploads.length} orphaned uploads`,
        );
      } else {
        this.logger.log('No orphaned uploads found');
      }
    } catch (error) {
      this.logger.error('Error cleaning up orphaned uploads:', error);
    }
  }

  @Cron('0 9 * * *')
  async notifyExpiringQrCodes() {
    try {
      const now = new Date();
      const in24Hours = addHours(now, 24);

      const expiringQrCodes = await this.qrCodeRepository.find({
        where: {
          expirationDate: Between(now, in24Hours),
          active: true,
          deletedAt: null as any,
        },
        relations: ['user'],
      });

      let notified = 0;
      for (const qrCode of expiringQrCodes) {
        if (!qrCode.user?.email) continue;

        try {
          const expiresAt = qrCode.expirationDate
            ? new Date(qrCode.expirationDate).toLocaleDateString('pt-BR')
            : 'em breve';

          await this.dispatcherEmailService.sendEmail(
            qrCode.user.email,
            `FotoUai — Seu evento "${qrCode.eventName || 'Evento'}" expira em breve!`,
            `Olá ${qrCode.user.name || ''}! O evento "${qrCode.eventName || 'Seu Evento'}" vai expirar em ${expiresAt}. Após a expiração, não será mais possível enviar novas fotos/vídeos. Se necessário, faça o upgrade para Premium para estender o prazo.`,
            this.buildExpirationHtml(
              qrCode.user.name || '',
              qrCode.eventName || 'Seu Evento',
              expiresAt,
            ),
          );
          notified++;
        } catch (emailErr: unknown) {
          this.logger.error(
            `Failed to send expiration email for QR ${qrCode.id}: ${emailErr instanceof Error ? emailErr.message : String(emailErr)}`,
          );
        }
      }

      this.logger.log(
        `Sent ${notified} expiration notification emails (${expiringQrCodes.length} QR codes expiring in 24h)`,
      );
    } catch (error) {
      this.logger.error('Error sending expiration notifications:', error);
    }
  }

  private buildExpirationHtml(
    userName: string,
    eventName: string,
    expiresAt: string,
  ): string {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'localhost3001';
    return `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
        <div style="background: linear-gradient(135deg, #F59E0B, #D97706); padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">FotoUai</h1>
          <p style="color: #FEF3C7; margin: 8px 0 0; font-size: 14px;">Evento Expirando</p>
        </div>
        <div style="padding: 32px 24px;">
          <p style="font-size: 16px; color: #1f2937; margin: 0 0 16px;">Olá <strong>${userName}</strong>,</p>
          <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 24px;">
            Seu evento <strong>"${eventName}"</strong> vai expirar em <strong>${expiresAt}</strong>.
          </p>
          <div style="background: #FFFBEB; border-radius: 8px; padding: 16px; margin: 0 0 24px; border: 1px solid #FDE68A;">
            <p style="font-size: 13px; color: #92400E; margin: 0; font-weight: 600;">
              Após a expiração, não será possível enviar novas fotos ou vídeos para este evento.
            </p>
          </div>
          <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 24px;">
            Se precisar de mais tempo, faça um upgrade do plano e estenda o prazo do seu evento.
          </p>
          <div style="text-align: center;">
            <a href="${frontendUrl}/#/dashboard" style="display: inline-block; background: linear-gradient(135deg, #F59E0B, #D97706); color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
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

  @Cron('0 2 1 * *')
  async logMonthlyStatistics() {
    try {
      const totalQrCodes = await this.qrCodeRepository.count();
      const activeQrCodes = await this.qrCodeRepository.count({
        where: { active: true, deletedAt: null },
      });
      const deletedQrCodes = await this.qrCodeRepository.count({
        where: { deletedAt: LessThan(new Date()) },
      });

      const totalUploads = await this.uploadRepository.count();
      const activeUploads = await this.uploadRepository.count({
        where: { deletedAt: null },
      });

      this.logger.log('=== Monthly Statistics ===');
      this.logger.log(`Total QR Codes: ${totalQrCodes}`);
      this.logger.log(`Active QR Codes: ${activeQrCodes}`);
      this.logger.log(`Deleted QR Codes: ${deletedQrCodes}`);
      this.logger.log(`Total Uploads: ${totalUploads}`);
      this.logger.log(`Active Uploads: ${activeUploads}`);
      this.logger.log('=========================');
    } catch (error) {
      this.logger.error('Error logging monthly statistics:', error);
    }
  }
}

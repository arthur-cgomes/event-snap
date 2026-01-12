import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { QrCode } from '../../qrcode/entity/qrcode.entity';
import { Upload } from '../../upload/entity/upload.entity';
import { subDays } from 'date-fns';

@Injectable()
export class CleanupTask {
  private readonly logger = new Logger(CleanupTask.name);

  constructor(
    @InjectRepository(QrCode)
    private readonly qrCodeRepository: Repository<QrCode>,
    @InjectRepository(Upload)
    private readonly uploadRepository: Repository<Upload>,
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
        .where('expirationDate < :thirtyDaysAgo', { thirtyDaysAgo })
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

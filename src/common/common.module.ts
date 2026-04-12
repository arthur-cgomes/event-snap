import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheService } from './services/cache.service';
import { AuditService } from './services/audit.service';
import { RedisProvider } from './config/redis.config';
import { CleanupTask } from './tasks/cleanup.task';
import { QrCode } from '../modules/qrcode/entity/qrcode.entity';
import { Upload } from '../modules/upload/entity/upload.entity';
import { AuditLog } from './entity/audit-log.entity';
import { EmailModule } from '../modules/email/email.module';

@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([QrCode, Upload, AuditLog]),
    EmailModule,
  ],
  providers: [RedisProvider, CacheService, AuditService, CleanupTask],
  exports: [CacheService, AuditService],
})
export class CommonModule {}

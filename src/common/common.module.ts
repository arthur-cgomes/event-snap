import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheService } from './services/cache.service';
import { RedisProvider } from '../config/redis.config';
import { CleanupTask } from './tasks/cleanup.task';
import { QrCode } from '../qrcode/entity/qrcode.entity';
import { Upload } from '../upload/entity/upload.entity';

@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([QrCode, Upload]),
  ],
  providers: [RedisProvider, CacheService, CleanupTask],
  exports: [CacheService],
})
export class CommonModule {}

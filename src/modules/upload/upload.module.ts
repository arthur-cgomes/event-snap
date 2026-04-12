import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { Upload } from './entity/upload.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { QrcodeModule } from '../qrcode/qrcode.module';
import { EmailModule } from '../email/email.module';
import { TurnstileService } from '../../common/services/turnstile.service';
import { UploadRateLimitGuard } from '../../common/guards/upload-rate-limit.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Upload]),
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
    QrcodeModule,
    EmailModule,
    ConfigModule,
  ],
  providers: [UploadService, TurnstileService, UploadRateLimitGuard],
  controllers: [UploadController],
  exports: [UploadService],
})
export class UploadModule {}

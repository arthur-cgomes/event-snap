import { Module } from '@nestjs/common';
import { QrcodeService } from './qrcode.service';
import { QrcodeController } from './qrcode.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QrCode } from './entity/qrcode.entity';
import { PassportModule } from '@nestjs/passport';

@Module({
  imports: [
    TypeOrmModule.forFeature([QrCode]),
    PassportModule.register({ defaultStrategy: 'jwt', session: false }),
  ],
  providers: [QrcodeService],
  controllers: [QrcodeController],
  exports: [QrcodeService],
})
export class QrcodeModule {}

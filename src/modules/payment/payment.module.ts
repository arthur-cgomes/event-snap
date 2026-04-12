import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Payment } from './entity/payment.entity';
import { QrCode } from '../qrcode/entity/qrcode.entity';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, QrCode]),
    ConfigModule,
    EmailModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}

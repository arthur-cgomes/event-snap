import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Payment } from './entity/payment.entity';
import { QrCode } from '../qrcode/entity/qrcode.entity';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { DispatcherEmailModule } from '../dispatcher-email/dispatcher-email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, QrCode]),
    ConfigModule,
    DispatcherEmailModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}

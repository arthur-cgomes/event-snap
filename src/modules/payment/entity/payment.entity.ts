import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { BaseCollection } from '../../../common/entity/base.entity';
import { User } from '../../user/entity/user.entity';
import { QrCode } from '../../qrcode/entity/qrcode.entity';
import { PaymentStatus } from '../enum/payment-status.enum';

@Entity('payment')
export class Payment extends BaseCollection {
  @ApiProperty({ description: 'ID da sessão do Stripe Checkout' })
  @Index('IDX_payment_stripeSessionId', { unique: true })
  @Column({ name: 'stripe_session_id', type: 'varchar', unique: true })
  stripeSessionId: string;

  @ApiProperty({ description: 'ID do PaymentIntent do Stripe' })
  @Column({
    name: 'stripe_payment_intent_id',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  stripePaymentIntentId: string;

  @ApiProperty({ description: 'Valor do pagamento em centavos' })
  @Column({ type: 'int' })
  amount: number;

  @ApiProperty({ description: 'Moeda do pagamento' })
  @Column({ type: 'varchar', default: 'brl' })
  currency: string;

  @ApiProperty({ enum: PaymentStatus, description: 'Status do pagamento' })
  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @ApiProperty({ description: 'Método de pagamento (card, pix, boleto)' })
  @Column({
    name: 'payment_method',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  paymentMethod: string;

  @ApiProperty({ description: 'Data do pagamento confirmado' })
  @Column({ name: 'paid_at', type: 'timestamp', nullable: true, default: null })
  paidAt: Date;

  @ApiProperty({
    description: 'Usuário que realizou o pagamento',
    type: () => User,
  })
  @Index('IDX_payment_userId')
  @ManyToOne(() => User, { eager: false })
  user: User;

  @ApiProperty({
    description: 'QR Code associado ao pagamento',
    type: () => QrCode,
  })
  @Index('IDX_payment_qrCodeId')
  @ManyToOne(() => QrCode, { eager: false })
  qrCode: QrCode;
}

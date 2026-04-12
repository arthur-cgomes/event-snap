import { ApiProperty } from '@nestjs/swagger';
import { BaseCollection } from '../../../common/entity/base.entity';
import { Column, Entity, Index, ManyToOne, OneToMany } from 'typeorm';
import { Upload } from '../../upload/entity/upload.entity';
import { User } from '../../user/entity/user.entity';
import { QrCodeType } from '../../../common/enum/qrcode-type.enum';

@Entity('qrcode')
export class QrCode extends BaseCollection {
  @ApiProperty({
    type: String,
    description: 'Token público para acesso ao QR code',
  })
  @Index('IDX_qrcode_token', { unique: true })
  @Column({ type: 'varchar', nullable: true, default: null })
  token: string;

  @ApiProperty({ type: String, description: 'Nome do evento' })
  @Column({
    name: 'event_name',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  eventName: string;

  @ApiProperty({
    type: String,
    description: 'Descrição do evento',
  })
  @Column({
    name: 'description_event',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  descriptionEvent: string;

  @ApiProperty({
    type: String,
    description: 'Cor referência ao evento',
  })
  @Column({
    name: 'event_color',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  eventColor: string;

  @ApiProperty({ type: Date, description: 'Data de expiração do QR code' })
  @Column({
    name: 'expiration_date',
    type: 'timestamp',
    nullable: true,
    default: null,
  })
  expirationDate: Date | null;

  @ApiProperty({
    enum: QrCodeType,
    description:
      'Tipo do QR Code: FREE (Grátis), PAID (Pago/Único) ou RECURRING (Recorrente)',
  })
  @Column({
    type: 'enum',
    enum: QrCodeType,
    default: QrCodeType.FREE,
  })
  type: QrCodeType;

  @ApiProperty({
    description: 'Relação com o usuário',
    type: () => User,
  })
  @Index('IDX_qrcode_userId')
  @ManyToOne(() => User, (user) => user.qrCodes)
  user: User;

  @ApiProperty({
    description: 'Relação com o upload',
    type: () => [Upload],
  })
  @OneToMany(() => Upload, (upload) => upload.qrCode)
  uploads: Upload[];
}

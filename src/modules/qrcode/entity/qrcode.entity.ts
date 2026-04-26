import { ApiProperty } from '@nestjs/swagger';
import { BaseCollection } from '../../../common/entity/base.entity';
import { Column, Entity, Index, ManyToOne, OneToMany } from 'typeorm';
import { Upload } from '../../upload/entity/upload.entity';
import { User } from '../../user/entity/user.entity';
import { QrCodeType } from '../../../common/enum/qrcode-type.enum';
import { QrCodePlan } from '../../../common/enum/qrcode-plan.enum';

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
    description: 'Tipo do QR Code: FREE (Grátis) ou PAID (Pago)',
  })
  @Column({
    type: 'enum',
    enum: QrCodeType,
    default: QrCodeType.FREE,
  })
  type: QrCodeType;

  @ApiProperty({
    enum: QrCodePlan,
    description:
      'Plano do QR Code: FREE (Grátis), PARTY (100 uploads, 15 dias) ou CORPORATE (ilimitado, 60 dias)',
  })
  @Column({
    type: 'enum',
    enum: QrCodePlan,
    default: QrCodePlan.FREE,
  })
  plan: QrCodePlan;

  @ApiProperty({
    type: String,
    description: 'Local do evento',
    nullable: true,
  })
  @Column({ nullable: true })
  eventLocation: string;

  @ApiProperty({
    type: Date,
    description: 'Data e hora do evento',
    nullable: true,
  })
  @Column({ type: 'timestamp', nullable: true })
  eventDateTime: Date;

  @ApiProperty({
    type: String,
    description: 'Código de dress code',
    nullable: true,
  })
  @Column({ nullable: true })
  dressCode: string;

  @ApiProperty({
    type: String,
    description: 'Tema do evento',
    nullable: true,
  })
  @Column({ nullable: true })
  eventTheme: string;

  @ApiProperty({
    type: String,
    description: 'URL da imagem de capa',
    nullable: true,
  })
  @Column({ nullable: true })
  coverImageUrl: string;

  @ApiProperty({
    type: String,
    description: 'Recomendações para o evento',
    nullable: true,
  })
  @Column({ type: 'text', nullable: true })
  recommendations: string;

  @ApiProperty({
    type: String,
    description: 'Prefixo da pasta no storage (slug do nome + sufixo do token)',
    nullable: true,
  })
  @Column({
    name: 'storage_prefix',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  storagePrefix: string;

  @ApiProperty({
    type: Boolean,
    description: 'Se o upload está habilitado para este QR code',
  })
  @Column({ default: false })
  uploadEnabled: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Se a galeria é visível para convidados logados',
  })
  @Column({ default: false })
  galleryEnabled: boolean;

  @ApiProperty({
    type: Number,
    description: 'Contagem de visualizações do evento',
  })
  @Column({ default: 0 })
  viewCount: number;

  @ApiProperty({
    type: Date,
    description: 'Data do último upload',
    nullable: true,
  })
  @Column({ type: 'timestamp', nullable: true })
  lastUploadAt: Date;

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

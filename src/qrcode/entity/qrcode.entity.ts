import { ApiProperty } from '@nestjs/swagger';
import { BaseCollection } from 'src/common/entity/base.entity';
import { Column, Entity, ManyToOne, OneToMany } from 'typeorm';
import { Upload } from '../../upload/entity/upload.entity';
import { User } from '../../user/entity/user.entity';

@Entity('qrcode')
export class QrCode extends BaseCollection {
  @ApiProperty({
    type: String,
    description: 'Token público para acesso ao QR code',
  })
  @Column({ type: 'varchar', nullable: true, default: null })
  token: string;

  @ApiProperty({ type: String, description: 'Nome do evento' })
  @Column({ type: 'varchar', nullable: true, default: null })
  eventName?: string;

  @ApiProperty({
    type: String,
    description: 'Descrição do evento',
  })
  @Column({ type: 'varchar', nullable: true, default: null })
  descriptionEvent?: string;

  @ApiProperty({ type: Date, description: 'Data de expiração do QR code' })
  @Column({ type: 'timestamp' })
  expirationDate: Date;

  @ApiProperty({
    description: 'Relação com o usuário',
    type: () => User,
  })
  @ManyToOne(() => User, (user) => user.qrCodes)
  user: User;

  @ApiProperty({
    description: 'Relação com o upload',
    type: () => [Upload],
  })
  @OneToMany(() => Upload, (upload) => upload.qrCode)
  uploads: Upload[];
}

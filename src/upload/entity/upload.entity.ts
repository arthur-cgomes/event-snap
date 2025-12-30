import { Entity, Column, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { QrCode } from '../../qrcode/entity/qrcode.entity';
import { BaseCollection } from '../../common/entity/base.entity';

@Entity('upload')
export class Upload extends BaseCollection {
  @ApiProperty({ description: 'URL do arquivo' })
  @Column()
  fileUrl: string;

  @ApiProperty({ description: 'QR code relacionado', type: () => QrCode })
  @ManyToOne(() => QrCode, (qrCode) => qrCode.uploads)
  qrCode: QrCode;
}

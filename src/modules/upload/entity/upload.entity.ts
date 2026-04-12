import { Entity, Column, Index, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { QrCode } from '../../qrcode/entity/qrcode.entity';
import { BaseCollection } from '../../../common/entity/base.entity';

@Entity('upload')
export class Upload extends BaseCollection {
  @ApiProperty({ description: 'URL do arquivo' })
  @Column({ name: 'file_url' })
  fileUrl: string;

  @ApiProperty({ description: 'QR code relacionado', type: () => QrCode })
  @Index('IDX_upload_qrCodeId')
  @ManyToOne(() => QrCode, (qrCode) => qrCode.uploads)
  qrCode: QrCode;
}

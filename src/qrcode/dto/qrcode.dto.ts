import { OmitType } from '@nestjs/swagger';
import { QrCode } from '../entity/qrcode.entity';

export class QrCodeDto extends OmitType(QrCode, ['user', 'uploads']) {}

import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID, IsEnum, IsOptional } from 'class-validator';
import { QrCodePlan } from '../../../common/enum/qrcode-plan.enum';

export class CreateCheckoutDto {
  @ApiProperty({ description: 'ID do QR Code a ser atualizado para PAID' })
  @IsNotEmpty()
  @IsUUID()
  qrCodeId: string;

  @ApiProperty({
    description: 'Plano desejado (PARTY ou CORPORATE)',
    enum: QrCodePlan,
    required: false,
  })
  @IsOptional()
  @IsEnum(QrCodePlan)
  plan?: QrCodePlan;
}

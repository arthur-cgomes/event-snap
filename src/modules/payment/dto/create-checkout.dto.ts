import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateCheckoutDto {
  @ApiProperty({ description: 'ID do QR Code a ser atualizado para PAID' })
  @IsNotEmpty()
  @IsUUID()
  qrCodeId: string;
}

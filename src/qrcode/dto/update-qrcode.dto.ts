import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsEnum, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { QrCodeType } from '../../common/enum/qrcode-type.enum';

export class UpdateQrcodeDto {
  @ApiProperty({ type: String, description: 'Nome do evento' })
  @IsOptional()
  @IsString()
  eventName?: string;

  @ApiProperty({ type: String, description: 'Descrição do evento' })
  @IsOptional()
  @IsString()
  descriptionEvent?: string;

  @ApiProperty({ type: String, description: 'Cor referência ao evento' })
  @IsOptional()
  @IsString()
  eventColor?: string;

  @ApiProperty({ type: Date, description: 'Data de expiração' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  expirationDate?: Date | null;

  @ApiProperty({ type: String, description: 'Tipo do QR Code' })
  @IsOptional()
  @IsEnum(QrCodeType)
  type?: QrCodeType;
}

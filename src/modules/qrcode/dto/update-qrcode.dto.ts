import { ApiProperty } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QrCodeType } from '../../../common/enum/qrcode-type.enum';
import { QrCodePlan } from '../../../common/enum/qrcode-plan.enum';

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

  @ApiProperty({
    type: String,
    description: 'Plano do QR Code (FREE, PARTY, CORPORATE)',
  })
  @IsOptional()
  @IsEnum(QrCodePlan)
  plan?: QrCodePlan;

  @ApiProperty({
    type: String,
    description: 'Local do evento',
  })
  @IsOptional()
  @IsString()
  eventLocation?: string;

  @ApiProperty({
    type: Date,
    description: 'Data e hora do evento',
  })
  @IsOptional()
  @IsDateString()
  eventDateTime?: string;

  @ApiProperty({
    type: String,
    description: 'Código de dress code',
  })
  @IsOptional()
  @IsString()
  dressCode?: string;

  @ApiProperty({
    type: String,
    description: 'Tema do evento',
  })
  @IsOptional()
  @IsString()
  eventTheme?: string;

  @ApiProperty({
    type: String,
    description: 'URL da imagem de capa',
  })
  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @ApiProperty({
    type: String,
    description: 'Recomendações para o evento',
  })
  @IsOptional()
  @IsString()
  recommendations?: string;

  @ApiProperty({
    type: Boolean,
    description: 'Se o upload está habilitado',
  })
  @IsOptional()
  @IsBoolean()
  uploadEnabled?: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Se a galeria é visível para convidados logados',
  })
  @IsOptional()
  @IsBoolean()
  galleryEnabled?: boolean;
}

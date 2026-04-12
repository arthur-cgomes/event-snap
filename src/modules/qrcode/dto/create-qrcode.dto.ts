import { ApiProperty } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QrCodeType } from '../../../common/enum/qrcode-type.enum';
import { QrCodePlan } from '../../../common/enum/qrcode-plan.enum';

export class CreateQrcodeDto {
  @ApiProperty({ type: String, description: 'ID do usuário dono do QR code' })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiProperty({ type: String, description: 'Nome do evento' })
  @IsNotEmpty()
  @IsString()
  eventName: string;

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
  @IsNotEmpty()
  @IsEnum(QrCodeType)
  type: QrCodeType;

  @ApiProperty({
    type: String,
    description: 'Plano do QR Code (FREE, PARTY, CORPORATE)',
    required: false,
  })
  @IsOptional()
  @IsEnum(QrCodePlan)
  plan?: QrCodePlan;

  @ApiProperty({
    type: String,
    description: 'Local do evento',
    required: false,
  })
  @IsOptional()
  @IsString()
  eventLocation?: string;

  @ApiProperty({
    type: Date,
    description: 'Data e hora do evento',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  eventDateTime?: string;

  @ApiProperty({
    type: String,
    description: 'Código de dress code',
    required: false,
  })
  @IsOptional()
  @IsString()
  dressCode?: string;

  @ApiProperty({
    type: String,
    description: 'Tema do evento',
    required: false,
  })
  @IsOptional()
  @IsString()
  eventTheme?: string;

  @ApiProperty({
    type: String,
    description: 'URL da imagem de capa',
    required: false,
  })
  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @ApiProperty({
    type: String,
    description: 'Recomendações para o evento',
    required: false,
  })
  @IsOptional()
  @IsString()
  recommendations?: string;

  @ApiProperty({
    type: Boolean,
    description: 'Se o upload está habilitado',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  uploadEnabled?: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Se a galeria é visível para convidados logados',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  galleryEnabled?: boolean;
}

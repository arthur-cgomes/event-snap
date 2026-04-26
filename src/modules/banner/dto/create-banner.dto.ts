import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
} from 'class-validator';

export class CreateBannerDto {
  @ApiProperty({ description: 'Título do banner' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ description: 'Subtítulo', required: false })
  @IsOptional()
  @IsString()
  subtitle?: string;

  @ApiProperty({ description: 'Texto do botão CTA', required: false })
  @IsOptional()
  @IsString()
  buttonText?: string;

  @ApiProperty({ description: 'Link do botão', required: false })
  @IsOptional()
  @IsString()
  buttonLink?: string;

  @ApiProperty({ description: 'URL da imagem de fundo', required: false })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiProperty({
    description: 'Cor de fundo (Tailwind ou HEX)',
    required: false,
  })
  @IsOptional()
  @IsString()
  backgroundColor?: string;

  @ApiProperty({
    description: 'Ordem de exibição',
    required: false,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @ApiProperty({
    description: 'Status ativo do banner',
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    description: 'Data/hora de início (ISO 8601)',
    required: false,
    example: '2026-04-19T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiProperty({
    description: 'Data/hora de término (ISO 8601)',
    required: false,
    example: '2026-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

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

  @ApiProperty({ description: 'Data/hora de início', required: false })
  @IsOptional()
  @IsDateString()
  @Type(() => Date)
  startsAt?: Date;

  @ApiProperty({ description: 'Data/hora de término', required: false })
  @IsOptional()
  @IsDateString()
  @Type(() => Date)
  endsAt?: Date;
}

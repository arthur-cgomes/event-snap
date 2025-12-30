import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQrcodeDto {
  @ApiProperty({ type: String, description: 'ID do usuário dono do QR code' })
  @IsNotEmpty()
  @IsString()
  userId: string;

  @ApiProperty({ type: Date, description: 'Data de expiração' })
  @IsNotEmpty()
  @IsDate()
  @Type(() => Date)
  expirationDate: Date;

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
}

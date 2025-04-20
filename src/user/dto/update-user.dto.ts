import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({
    type: String,
    description: 'Nome do usuário',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    type: String,
    description: 'Contato do usuário',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    type: String,
    description: 'Email do usuário',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}

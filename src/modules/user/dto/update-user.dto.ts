import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';

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
  @Matches(/^\d{10,15}$/, { message: 'Phone must contain 10 to 15 digits' })
  phone?: string;

  @ApiProperty({
    type: String,
    description: 'Data de nascimento do usuário',
  })
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiProperty({
    type: String,
    description: 'Email do usuário',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}

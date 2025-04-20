import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class ConfirmResetDto {
  @ApiProperty({
    type: String,
    description: 'Email do usuário',
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({
    type: String,
    description: 'Senha do usuário',
  })
  @IsNotEmpty()
  @IsString()
  newPassword: string;

  @ApiProperty({
    type: String,
    description: 'Código de autenticação',
  })
  @Length(6, 6)
  @IsString()
  code: string;
}

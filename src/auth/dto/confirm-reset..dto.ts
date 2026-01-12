import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { IsStrongPassword } from '../../common/validators/password.validator';

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
    description:
      'Nova senha do usuário (mínimo 8 caracteres, incluindo maiúscula, minúscula, número e caractere especial)',
  })
  @IsNotEmpty()
  @IsStrongPassword()
  newPassword: string;

  @ApiProperty({
    type: String,
    description: 'Código de autenticação',
  })
  @Length(6, 6)
  @IsString()
  code: string;
}

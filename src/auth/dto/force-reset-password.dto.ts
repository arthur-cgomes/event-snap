import { IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStrongPassword } from '../../common/validators/password.validator';

export class ForceResetPasswordDto {
  @ApiProperty({
    type: String,
    description: 'Nova senha de autenticação (mínimo 8 caracteres, incluindo maiúscula, minúscula, número e caractere especial)',
  })
  @IsNotEmpty()
  @IsStrongPassword()
  password: string;
}

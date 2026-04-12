import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';
import { CreateUserDto } from '../../user/dto/create-user.dto';
import { IsStrongPassword } from '../../../common/validators/password.validator';

export class ConfirmSignupDto extends PartialType(CreateUserDto) {
  @ApiProperty({
    type: String,
    description: 'Nome do usuário',
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    type: String,
    description: 'Contato do usuário',
  })
  @IsNotEmpty()
  @IsString()
  phone: string;

  @ApiProperty({
    type: String,
    description: 'Data de nascimento do usuário',
  })
  @IsNotEmpty()
  @IsString()
  dateOfBirth: string;

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
      'Senha do usuário (mínimo 8 caracteres, incluindo maiúscula, minúscula, número e caractere especial)',
  })
  @IsNotEmpty()
  @IsStrongPassword()
  password: string;

  @ApiProperty({
    type: String,
    description: 'Código de autenticação',
  })
  @Length(6, 6)
  @IsString()
  code: string;
}

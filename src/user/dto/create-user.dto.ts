import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { UserType } from '../../common/enum/user-type.enum';

export class CreateUserDto {
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
    description: 'Senha do usuário',
  })
  @IsNotEmpty()
  @IsString()
  password: string;

  @ApiProperty({
    type: String,
    description: 'Nome do usuário que cadastrou o usuário',
  })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiProperty({
    type: String,
    description: 'Id do usuário criador',
  })
  @IsOptional()
  @IsString()
  createdById?: string;

  @ApiProperty({
    enum: UserType,
    description: 'Define o tipo de usuário',
  })
  @IsEnum(UserType)
  @IsOptional()
  @IsString()
  userType?: UserType;
}

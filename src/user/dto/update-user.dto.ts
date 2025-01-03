import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UserType } from '../../common/enum/user-type.enum';

export class UpdateUserDto {
  @ApiProperty({
    type: String,
    description: 'Email do usuário',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({
    type: String,
    description: 'Nome do usuário',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    type: String,
    description: 'Nome do usuário que cadastrou o usuário',
  })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiProperty({
    type: String,
    description: 'Id do usuario criador',
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

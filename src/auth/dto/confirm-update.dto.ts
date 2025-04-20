import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { UpdateUserDto } from 'src/user/dto/update-user.dto';

export class ConfirmUpdateUserDto extends UpdateUserDto {
  @ApiProperty({
    type: String,
    description: 'Código de autenticação',
  })
  @Length(6, 6)
  @IsString()
  code: string;
}

import { IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AuthPayload {
  @ApiProperty({
    description: 'Email do usuário',
  })
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Senha do usuário',
  })
  @IsNotEmpty()
  password: string;
}

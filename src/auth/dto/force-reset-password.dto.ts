import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForceResetPasswordDto {
  @ApiProperty({ type: String, description: 'Novo senha de autenticação' })
  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  password: string;
}

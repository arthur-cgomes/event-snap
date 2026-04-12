import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SocialLoginDto {
  @ApiProperty({ description: 'Firebase ID Token' })
  @IsNotEmpty()
  @IsString()
  firebaseToken: string;
}

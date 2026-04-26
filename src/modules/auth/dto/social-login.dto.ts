import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SocialLoginDto {
  @ApiProperty({ description: 'Supabase Access Token' })
  @IsNotEmpty()
  @IsString()
  supabaseToken: string;
}

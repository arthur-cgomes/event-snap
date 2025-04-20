import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateUploadDto {
  @ApiProperty({ description: 'Token público do QR code' })
  @IsNotEmpty()
  @IsString()
  token: string;

  @ApiProperty({ description: 'URL da imagem' })
  @IsNotEmpty()
  @IsString()
  imageUrl: string;
}

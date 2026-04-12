import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class DeleteFilesDto {
  @ApiProperty({
    description: 'Lista de URLs dos arquivos a serem deletadas',
    type: [String],
  })
  @IsNotEmpty()
  @IsArray()
  @IsString({ each: true })
  urls: string[];
}

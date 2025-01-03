import { ApiProperty } from '@nestjs/swagger';

export class DeleteResponseDto {
  @ApiProperty({
    description: 'Retorno padrão',
    type: String,
    example: 'removed',
  })
  message: string;
}

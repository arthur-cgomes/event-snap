import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetUploadsDto {
  @ApiProperty({
    required: false,
    default: 20,
    description: 'Number of items per page',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  take?: number = 20;

  @ApiProperty({
    required: false,
    default: 0,
    description: 'Number of items to skip',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  skip?: number = 0;
}

export class GetUploadsResponseDto {
  @ApiProperty({ type: [String] })
  items: string[];

  @ApiProperty({ type: Number })
  total: number;

  @ApiProperty({ type: Number, nullable: true })
  skip: number | null;
}

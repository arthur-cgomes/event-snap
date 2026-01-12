import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  IsIn,
  MaxLength,
} from 'class-validator';

/**
 * Base pagination DTO with validation to prevent injection and abuse
 */
export class PaginationDto {
  @ApiProperty({ required: false, default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 10;

  @ApiProperty({ required: false, default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @ApiProperty({ required: false, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiProperty({ required: false, default: 'createdAt' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sort?: string = 'createdAt';

  @ApiProperty({ required: false, enum: ['ASC', 'DESC'], default: 'ASC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  order?: 'ASC' | 'DESC' = 'ASC';
}

/**
 * Extended pagination DTO for QR code queries
 */
export class QrCodePaginationDto extends PaginationDto {
  @ApiProperty({ required: false, enum: ['active', 'expired'] })
  @IsOptional()
  @IsIn(['active', 'expired'])
  status?: 'active' | 'expired';
}

/**
 * Extended pagination DTO for user queries
 */
export class UserPaginationDto extends PaginationDto {
  @ApiProperty({ required: false, enum: ['active', 'inactive'] })
  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}

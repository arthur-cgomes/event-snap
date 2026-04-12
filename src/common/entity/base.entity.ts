import { ApiProperty } from '@nestjs/swagger';
import {
  BaseEntity,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export abstract class BaseCollection extends BaseEntity {
  @ApiProperty({ type: String })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ type: Date })
  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
  })
  createdAt: string;

  @ApiProperty({ type: Date })
  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
  })
  updatedAt: string;

  @ApiProperty({ type: Boolean })
  @Column({ name: 'active', type: 'bool', default: true })
  active: boolean;

  @ApiProperty({ type: Date })
  @DeleteDateColumn({
    name: 'deleted_at',
    type: 'timestamp',
    nullable: true,
    default: null,
  })
  deletedAt: Date;
}

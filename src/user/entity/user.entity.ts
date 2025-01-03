import { ApiProperty } from '@nestjs/swagger';
import { BaseCollection } from '../../common/entity/base.entity';
import { BeforeInsert, BeforeUpdate, Column, Entity, Unique } from 'typeorm';
import { UserType } from '../../common/enum/user-type.enum';
import * as bcrypt from 'bcrypt';

@Entity('user')
@Unique(['email'])
export class User extends BaseCollection {
  @ApiProperty({
    type: String,
    description: 'Email do usuário',
  })
  @Column({ type: 'varchar' })
  email: string;

  @ApiProperty({
    type: String,
    description: 'Senha do usuário',
  })
  @Column({ default: null, select: false })
  password: string;

  @ApiProperty({
    type: String,
    description: 'Nome do usuário',
  })
  @Column({ type: 'varchar', nullable: true, default: null })
  name: string;

  @ApiProperty({
    enum: UserType,
    description: 'Define o tipo de usuário',
  })
  @Column({ type: 'enum', enum: UserType, default: UserType.USER })
  userType: UserType;

  @ApiProperty({
    type: String,
    description: 'Nome do usuário que cadastrou o usuário',
    nullable: true,
  })
  @Column({ type: 'varchar', nullable: true, default: null })
  createdBy?: string;

  @ApiProperty({
    type: String,
    description: 'ID do usuário que cadastrou usuário',
    nullable: true,
  })
  @Column({ type: 'varchar', nullable: true, default: null })
  createdById?: string;

  @ApiProperty({
    type: Date,
    description: 'Último login do usuário',
    nullable: true,
  })
  @Column({ type: 'timestamp', nullable: true, default: null })
  lastLogin?: Date;

  @BeforeInsert()
  @BeforeUpdate()
  hashPassword() {
    if (
      this.password &&
      this.password !== undefined &&
      this.password !== null
    ) {
      this.password = bcrypt.hashSync(this.password, 10);
    }
  }

  checkPassword = (attempt: string) => {
    if (!this.password) return false;
    return bcrypt.compareSync(attempt, this.password);
  };
}

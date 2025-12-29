import { ApiProperty } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  OneToMany,
  Unique,
} from 'typeorm';
import { BaseCollection } from '../../common/entity/base.entity';
import { UserType } from '../../common/enum/user-type.enum';
import { QrCode } from '../../qrcode/entity/qrcode.entity';

@Entity('user')
@Unique(['email'])
export class User extends BaseCollection {
  @ApiProperty({
    type: String,
    description: 'Nome do usuário',
  })
  @Column({ type: 'varchar', nullable: true, default: null })
  name: string;

  @ApiProperty({
    type: String,
    description: 'Contato do usuário',
  })
  @Column({ type: 'varchar', nullable: true, default: null })
  phone: string;

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
    enum: UserType,
    description: 'Define o tipo de usuário',
  })
  @Column({ type: 'enum', enum: UserType, default: UserType.USER })
  userType: UserType;

  @ApiProperty({
    type: String,
    description: 'Nome do usuário que cadastrou o usuário',
  })
  @Column({ type: 'varchar', nullable: true, default: null })
  createdBy?: string;

  @ApiProperty({
    type: String,
    description: 'ID do usuário que cadastrou usuário',
  })
  @Column({ type: 'varchar', nullable: true, default: null })
  createdById?: string;

  @ApiProperty({
    type: Date,
    description: 'Último login do usuário',
  })
  @Column({ type: 'timestamp', nullable: true, default: null })
  lastLogin?: Date;

  @ApiProperty({
    description: 'Lista de QR Codes do usuário',
    type: () => [QrCode],
  })
  @OneToMany(() => QrCode, (qrCode) => qrCode.user)
  qrCodes: QrCode[];

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

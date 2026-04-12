import { ApiProperty } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  Entity,
  Index,
  OneToMany,
  Unique,
} from 'typeorm';
import { BaseCollection } from '../../../common/entity/base.entity';
import { UserType } from '../../../common/enum/user-type.enum';
import { QrCode } from '../../qrcode/entity/qrcode.entity';
import { APP_CONSTANTS } from '../../../common/constants';

@Entity('user')
@Unique(['email'])
@Index('IDX_user_active_userType', ['active', 'userType'])
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
    description: 'Data de nascimento do usuário',
  })
  @Column({
    name: 'date_of_birth',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  dateOfBirth: string;

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
  @Column({
    name: 'user_type',
    type: 'enum',
    enum: UserType,
    default: UserType.USER,
  })
  userType: UserType;

  @ApiProperty({
    type: String,
    description: 'Nome do usuário que cadastrou o usuário',
  })
  @Column({
    name: 'created_by',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  createdBy?: string;

  @ApiProperty({
    type: String,
    description: 'ID do usuário que cadastrou usuário',
  })
  @Column({
    name: 'created_by_id',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  createdById?: string;

  @ApiProperty({
    type: String,
    description: 'UID do Firebase (login social)',
  })
  @Index('IDX_user_firebaseUid')
  @Column({
    name: 'firebase_uid',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  firebaseUid?: string;

  @ApiProperty({
    type: String,
    description: 'Provedor de autenticação social (google, apple, facebook)',
  })
  @Column({
    name: 'auth_provider',
    type: 'varchar',
    nullable: true,
    default: null,
  })
  authProvider?: string;

  @ApiProperty({
    type: Date,
    description: 'Último login do usuário',
  })
  @Column({
    name: 'last_login',
    type: 'timestamp',
    nullable: true,
    default: null,
  })
  lastLogin?: Date;

  @ApiProperty({
    type: Boolean,
    description:
      'Se o usuário deseja receber notificações ao fazer upload em seus eventos',
  })
  @Column({ name: 'notify_on_upload', default: true })
  notifyOnUpload: boolean;

  @ApiProperty({
    type: Boolean,
    description: 'Notificar sobre expiração do evento',
  })
  @Column({ name: 'notify_on_expiration', default: true })
  notifyOnExpiration: boolean;

  @ApiProperty({ type: Boolean, description: 'Notificar sobre pagamentos' })
  @Column({ name: 'notify_on_payment', default: true })
  notifyOnPayment: boolean;

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
      this.password = bcrypt.hashSync(
        this.password,
        APP_CONSTANTS.BCRYPT_ROUNDS,
      );
    }
  }

  checkPassword = (attempt: string) => {
    if (!this.password) return false;
    return bcrypt.compareSync(attempt, this.password);
  };
}

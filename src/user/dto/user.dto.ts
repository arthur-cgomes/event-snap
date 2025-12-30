import { OmitType } from '@nestjs/swagger';
import { User } from '../entity/user.entity';

export class UserDto extends OmitType(User, ['qrCodes', 'password']) {}

import { User } from '../../../user/entity/user.entity';
import { UserType } from '../../../common/enum/user-type.enum';

export const mockUser = {
  id: '1',
  email: 'email@email.com',
  password: 'password',
  name: 'User name',
  phone: '1234567890',
  dateOfBirth: '2001-08-28',
  userType: UserType.USER,
} as unknown as User;

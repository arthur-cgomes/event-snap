import { User } from '../entity/user.entity';

export class UserDto extends User {}

// Em casos da entidade User ter relacionamentos, utilizar o "OmitType"
// export class UserDto extends OmitType(User, ['company']) {}

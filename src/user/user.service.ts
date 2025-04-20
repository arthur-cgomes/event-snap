import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entity/user.entity';
import { FindManyOptions, ILike, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { GetAllResponseDto } from 'src/common/dto/get-all.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  async checkUserToLogin(email: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { email },
      select: ['id', 'email', 'password', 'name', 'userType'],
    });

    if (!user) throw new NotFoundException('user with this email not found');

    await this.updateLastLogin(user.id);

    return user;
  }

  private async updateLastLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, { lastLogin: new Date() });
  }

  async resetPasswordByEmail(
    email: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findByEmail(email);
    if (!user) throw new NotFoundException('Usuário não encontrado');

    user.password = newPassword;
    await this.userRepository.save(user);
  }

  public async createUser(createUserDto: CreateUserDto): Promise<User> {
    const checkUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (checkUser) {
      throw new ConflictException('user with this email already exists');
    }

    return await this.userRepository.create(createUserDto).save();
  }

  public async updateUser(
    userId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<User> {
    await this.getUserById(userId);

    return await (
      await this.userRepository.preload({
        id: userId,
        ...updateUserDto,
      })
    ).save();
  }

  public async getUserById(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('user with this id not found');
    }

    return user;
  }

  public async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  public async getAllUsers(
    take: number,
    skip: number,
    search: string,
    sort: string,
    order: 'ASC' | 'DESC',
  ): Promise<GetAllResponseDto<User>> {
    const conditions: FindManyOptions<User> = {
      take,
      skip,
      order: {
        [sort]: order,
      },
    };

    if (search) {
      conditions.where = {
        name: ILike(`%${search}%`),
      };
    }

    const [items, count] = await this.userRepository.findAndCount(conditions);

    if (items.length == 0) {
      return { skip: null, total: 0, items };
    }
    const over = count - Number(take) - Number(skip);
    skip = over <= 0 ? null : Number(skip) + Number(take);

    return { skip, total: count, items };
  }

  public async deleteUser(userId: string): Promise<string> {
    const user = await this.getUserById(userId);
    await this.userRepository.remove(user);

    return 'removed';
  }
}

import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entity/user.entity';
import {
  Between,
  FindManyOptions,
  FindOptionsWhere,
  ILike,
  IsNull,
  LessThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { GetAllResponseDto } from 'src/common/dto/get-all.dto';
import { UsersCountParams, UsersCountResponse } from './dto/get-dashboard.dto';
import { endOfDay, startOfDay, subMonths } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { UserType } from '../common/enum/user-type.enum';
import { QrcodeService } from '../qrcode/qrcode.service';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @Inject(forwardRef(() => QrcodeService))
    private readonly qrCodeService: QrcodeService,
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

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    const checkUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (checkUser) {
      throw new ConflictException('user with this email already exists');
    }

    return await this.userRepository.create(createUserDto).save();
  }

  async updateUser(
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

  async getUserById(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('user with this id not found');
    }

    return user;
  }

  async getAllUsers(
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

  async deleteUser(userId: string): Promise<string> {
    const user = await this.getUserById(userId);
    await this.userRepository.remove(user);

    return 'removed';
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async getDashAdmin(params?: UsersCountParams): Promise<{
    usersCreated: number;
    usersLoggedIn: number;
    usersInactive: number;
    qrcodeActive: number;
    qrcodeExpired: number;
    qrcodeNone: number;
    window: { from: Date; to: Date; tz: string } | undefined;
  }> {
    const [usersRes, qrStats] = await Promise.all([
      this.getUsersCount(params).catch(() => undefined),
      this.getIdsUsers().catch(() => ({ active: 0, expired: 0, none: 0 })),
    ]);

    return {
      usersCreated: usersRes?.usersCreated ?? 0,
      usersLoggedIn: usersRes?.usersLoggedIn ?? 0,
      usersInactive: usersRes?.usersInactive ?? 0,
      qrcodeActive: qrStats?.active ?? 0,
      qrcodeExpired: qrStats?.expired ?? 0,
      qrcodeNone: qrStats?.none ?? 0,
      window: usersRes?.window,
    };
  }

  async getUsersCount(params?: UsersCountParams): Promise<UsersCountResponse> {
    const { fromUtc, toUtc, tz } = this.buildUtcRange(params);

    const [usersCreated, usersLoggedIn, usersInactive] = await Promise.all([
      this.userRepository.count({
        where: {
          userType: UserType.USER,
          active: true,
        },
      }),
      this.userRepository.count({
        where: {
          userType: UserType.USER,
          lastLogin: Between(fromUtc, toUtc),
        },
      }),
      this.userRepository.count({
        where: {
          userType: UserType.USER,
          active: false,
        },
      }),
    ]);

    return {
      usersCreated,
      usersLoggedIn,
      usersInactive,
      window: { from: fromUtc, to: toUtc, tz },
    };
  }

  async getIdsUsers() {
    const users = await this.userRepository.find({
      where: { userType: UserType.USER },
      select: { id: true },
    });

    const ids = users.map((u) => u.id).filter(Boolean);
    const stats = await this.qrCodeService.getUsersQrStatusCounts(ids);

    return stats;
  }

  async getUsersCreatedDashAdmin(
    take: number,
    skip: number,
    search: string,
    sort: string,
    order: 'ASC' | 'DESC',
  ) {
    const where: any = { userType: UserType.USER };

    if (search) {
      where.name = ILike(`%${search}%`);
    }

    const [items, count] = await this.userRepository.findAndCount({
      take,
      skip,
      where,
      select: {
        id: true,
        createdAt: true,
        name: true,
        email: true,
        phone: true,
        createdBy: true,
        createdById: true,
        lastLogin: true,
      },
      order: {
        [sort]: order,
      },
    });

    return this.formatPaginationResponse(items, count, take, skip);
  }

  async getUsersByStatusDashAdmin(
    take: number,
    skip: number,
    status: 'active' | 'inactive',
    sort: string,
    order: 'ASC' | 'DESC',
  ) {
    const { fromUtc } = this.buildUtcRange();
    let where: FindOptionsWhere<User> | FindOptionsWhere<User>[];

    if (status === 'active') {
      where = {
        userType: UserType.USER,
        lastLogin: MoreThanOrEqual(fromUtc),
      };
    } else {
      const conditionExp = {
        userType: UserType.USER,
        lastLogin: LessThan(fromUtc),
      };
      const conditionNull = {
        userType: UserType.USER,
        lastLogin: IsNull(),
      };

      where = [conditionExp, conditionNull];
    }

    const [items, count] = await this.userRepository.findAndCount({
      take,
      skip,
      where,
      select: {
        id: true,
        createdAt: true,
        name: true,
        email: true,
        phone: true,
        createdBy: true,
        createdById: true,
        lastLogin: true,
      },
      order: {
        [sort]: order,
      },
    });

    return this.formatPaginationResponse(items, count, take, skip);
  }

  async getUsersWithoutQrCodes(
    take: number,
    skip: number,
    sort: string,
    order: 'ASC' | 'DESC',
  ): Promise<GetAllResponseDto<User>> {
    const where: FindOptionsWhere<User> = {
      qrCodes: {
        id: IsNull(),
      },
    };

    const [items, count] = await this.userRepository.findAndCount({
      take,
      skip,
      where,
      order: {
        [sort]: order,
      },
      relations: ['qrCodes'],
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        lastLogin: true,
      },
    });

    return this.formatPaginationResponse(items, count, take, skip);
  }

  private buildUtcRange(params?: UsersCountParams) {
    const tz = params?.tz ?? 'America/Sao_Paulo';

    if (!params?.start && !params?.end) {
      const now = new Date();
      const nowInTz = toZonedTime(now, tz);
      const oneMonthAgoInTz = subMonths(nowInTz, 1);
      const startOfPeriod = startOfDay(oneMonthAgoInTz);
      const endOfPeriod = endOfDay(nowInTz);
      const fromUtc = fromZonedTime(startOfPeriod, tz);
      const toUtc = fromZonedTime(endOfPeriod, tz);

      return { fromUtc, toUtc, tz };
    }

    return {
      fromUtc: new Date(params.start),
      toUtc: new Date(params.end),
      tz,
    };
  }

  private formatPaginationResponse(
    items: any[],
    count: number,
    take: number,
    skip: number,
  ) {
    if (items.length == 0) {
      return { skip: null, total: 0, items };
    }
    const over = count - Number(take) - Number(skip);
    const nextSkip = over <= 0 ? null : Number(skip) + Number(take);

    return { skip: nextSkip, total: count, items };
  }
}

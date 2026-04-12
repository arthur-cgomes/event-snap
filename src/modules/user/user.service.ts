import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entity/user.entity';
import {
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
import { GetAllResponseDto } from '../../common/dto/get-all.dto';
import {
  AdminDashResponse,
  UsersCountParams,
  UsersCountResponse,
} from './dto/get-dashboard.dto';
import { endOfDay, startOfDay, subMonths } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { UserType } from '../../common/enum/user-type.enum';
import { CacheService } from '../../common/services/cache.service';
import { UserCreatedEvent } from '../../common/events/user-created.event';
import { APP_CONSTANTS } from '../../common/constants';

@Injectable()
export class UserService {
  private readonly CACHE_PREFIX = 'user';

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheService: CacheService,
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

  async findByEmail(email: string): Promise<User | null> {
    return await this.userRepository.findOne({ where: { email } });
  }

  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    return await this.userRepository.findOne({ where: { firebaseUid } });
  }

  async linkFirebaseUid(
    userId: string,
    firebaseUid: string,
    authProvider: string,
  ): Promise<void> {
    await this.userRepository.update(userId, { firebaseUid, authProvider });
  }

  async checkEmailAvailable(email: string): Promise<void> {
    const existing = await this.userRepository.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('email already registered');
    }
  }

  async resetPasswordByEmail(
    email: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) throw new NotFoundException('user not found');
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

    const savedUser = await this.userRepository.create(createUserDto).save();
    this.eventEmitter.emit('user.created', new UserCreatedEvent(savedUser.id));

    await this.cacheService.del(`${this.CACHE_PREFIX}:dashboard`);

    return savedUser;
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
      where: { deletedAt: IsNull() },
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
    await this.getUserById(userId);

    await this.userRepository.update(userId, {
      active: false,
      deletedAt: new Date(),
      name: `Deleted User ${userId.substring(0, 8)}`,
      email: `deleted_${userId}@anonymized.local`,
      phone: null,
      dateOfBirth: null,
    });

    await this.cacheService.del(`${this.CACHE_PREFIX}:dashboard`);

    return 'user anonymized and deactivated';
  }

  async getDashAdmin(params?: UsersCountParams): Promise<AdminDashResponse> {
    const cacheKey = `${this.CACHE_PREFIX}:dashboard`;
    const cached = await this.cacheService.get<AdminDashResponse>(cacheKey);

    if (cached) {
      return cached;
    }

    const [usersRes, qrStats] = await Promise.all([
      this.getUsersCount(params).catch(() => undefined),
      this.getIdsUsers().catch(() => ({ active: 0, expired: 0, none: 0 })),
    ]);

    const result = {
      usersCreated: usersRes?.usersCreated ?? 0,
      usersLoggedIn: usersRes?.usersLoggedIn ?? 0,
      usersInactive: usersRes?.usersInactive ?? 0,
      qrcodeActive: qrStats?.active ?? 0,
      qrcodeExpired: qrStats?.expired ?? 0,
      qrcodeNone: qrStats?.none ?? 0,
      window: usersRes?.window,
    };

    await this.cacheService.set(
      cacheKey,
      result,
      APP_CONSTANTS.DASHBOARD_CACHE_TTL,
    );

    return result;
  }

  async getUsersCount(params?: UsersCountParams): Promise<UsersCountResponse> {
    const { fromUtc, toUtc, tz } = this.buildUtcRange(params);

    const result = await this.userRepository
      .createQueryBuilder('user')
      .select([
        'COUNT(CASE WHEN user."user_type" = :userType AND user.active = true THEN 1 END) as "usersCreated"',
        'COUNT(CASE WHEN user."user_type" = :userType AND user."last_login" BETWEEN :fromUtc AND :toUtc THEN 1 END) as "usersLoggedIn"',
        'COUNT(CASE WHEN user."user_type" = :userType AND user.active = false THEN 1 END) as "usersInactive"',
      ])
      .where('user.userType = :userType')
      .setParameters({
        userType: UserType.USER,
        fromUtc,
        toUtc,
      })
      .getRawOne();

    return {
      usersCreated: parseInt(result.usersCreated) || 0,
      usersLoggedIn: parseInt(result.usersLoggedIn) || 0,
      usersInactive: parseInt(result.usersInactive) || 0,
      window: { from: fromUtc, to: toUtc, tz },
    };
  }

  private async getIdsUsers(): Promise<{
    active: number;
    expired: number;
    none: number;
  }> {
    const now = new Date().toISOString();

    const result = await this.userRepository
      .createQueryBuilder('user')
      .select([
        `COUNT(DISTINCT CASE WHEN qr.id IS NOT NULL AND qr."expiration_date" > :now THEN user.id END) as "active"`,
        `COUNT(DISTINCT CASE WHEN qr.id IS NOT NULL AND qr."expiration_date" <= :now THEN user.id END) as "expired"`,
        `COUNT(DISTINCT CASE WHEN qr.id IS NULL THEN user.id END) as "none"`,
      ])
      .leftJoin('user.qrCodes', 'qr')
      .where('user.userType = :userType', { userType: UserType.USER })
      .andWhere('user.active = :active', { active: true })
      .andWhere('user.deletedAt IS NULL')
      .setParameter('now', now)
      .getRawOne();

    return {
      active: parseInt(result?.active || '0', 10),
      expired: parseInt(result?.expired || '0', 10),
      none: parseInt(result?.none || '0', 10),
    };
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
      userType: UserType.USER,
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
    const tz = params?.tz ?? APP_CONSTANTS.DEFAULT_TIMEZONE;

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

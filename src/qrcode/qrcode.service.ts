import { InjectRepository } from '@nestjs/typeorm';
import {
  FindManyOptions,
  FindOptionsWhere,
  ILike,
  In,
  LessThanOrEqual,
  MoreThan,
  Repository,
} from 'typeorm';
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QrCode } from './entity/qrcode.entity';
import { CreateQrcodeDto } from './dto/create-qrcode.dto';
import * as QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { UserService } from '../user/user.service';
import { fromZonedTime } from 'date-fns-tz';
import { isValid } from 'date-fns';
import { GetAllResponseDto } from '../common/dto/get-all.dto';
import { UpdateQrcodeDto } from './dto/update-qrcode.dto';
import { CacheService } from '../common/services/cache.service';

@Injectable()
export class QrcodeService {
  private readonly CACHE_PREFIX = 'qrcode';
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    @InjectRepository(QrCode)
    private readonly qrCodeRepository: Repository<QrCode>,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly cacheService: CacheService,
  ) {}

  async createQrCode(
    createQrcodeDto: CreateQrcodeDto,
  ): Promise<{ qrCode: QrCode; qrCodeImage: string }> {
    const {
      userId,
      expirationDate,
      eventName,
      descriptionEvent,
      eventColor,
      type,
    } = createQrcodeDto;

    await this.userService.getUserById(userId);
    const token = uuidv4();
    const expirationUtc = this.resolveExpirationDate(expirationDate);

    const qrCode = this.qrCodeRepository.create({
      token,
      eventName,
      descriptionEvent,
      user: { id: userId } as any,
      ...(expirationUtc ? { expirationDate: expirationUtc } : {}),
      eventColor,
      type,
    });

    const savedQrCode = await this.qrCodeRepository.save(qrCode);

    // Cache the QR code with dynamic TTL based on expiration
    const ttl = this.calculateCacheTTL(savedQrCode.expirationDate);
    await this.cacheService.set(
      `${this.CACHE_PREFIX}:token:${token}`,
      savedQrCode,
      ttl,
    );
    await this.cacheService.set(
      `${this.CACHE_PREFIX}:id:${savedQrCode.id}`,
      savedQrCode,
      ttl,
    );

    // Invalidate user's QR code list cache
    await this.cacheService.delByPattern(`${this.CACHE_PREFIX}:user:${userId}:*`);

    const frontendUrl =
      process.env.FRONTEND_URL ||
      'https://event-snap-front-end-production.up.railway.app';
    const qrData = `${frontendUrl}/#/event/${token}`;

    const qrCodeImage = await QRCode.toDataURL(qrData);

    return { qrCode: savedQrCode, qrCodeImage };
  }

  async updateQrCode(
    qrCodeId: string,
    updateQrcodeDto: UpdateQrcodeDto,
  ): Promise<QrCode> {
    const qrcode = await this.getQrCodeById(qrCodeId);

    if (typeof updateQrcodeDto.eventName === 'string') {
      qrcode.eventName = updateQrcodeDto.eventName;
    }

    if (typeof updateQrcodeDto.descriptionEvent === 'string') {
      qrcode.descriptionEvent = updateQrcodeDto.descriptionEvent;
    }

    if (
      updateQrcodeDto.expirationDate !== undefined &&
      updateQrcodeDto.expirationDate !== null
    ) {
      const candidate = this.resolveExpirationDate(
        updateQrcodeDto.expirationDate,
      );
      if (candidate) {
        qrcode.expirationDate = candidate;
      }
    }

    const updated = await this.qrCodeRepository.save(qrcode);

    // Invalidate all cache entries for this QR code
    await this.invalidateQrCodeCache(updated.id, updated.token);

    return updated;
  }

  async getQrCodeById(idOrToken: string): Promise<QrCode> {
    // Try cache first
    const cacheKey = `${this.CACHE_PREFIX}:id:${idOrToken}`;
    const cached = await this.cacheService.get<QrCode>(cacheKey);

    if (cached) {
      return cached;
    }

    const qrcode = await this.qrCodeRepository.findOne({
      where: { id: idOrToken },
      relations: ['user'],
    });

    if (!qrcode) {
      throw new NotFoundException('qrcode not found');
    }

    // Cache for future requests
    const ttl = this.calculateCacheTTL(qrcode.expirationDate);
    await this.cacheService.set(cacheKey, qrcode, ttl);

    return qrcode;
  }

  async getQrCodeByIdOrToken(idOrToken: string): Promise<QrCode> {
    // Try cache by ID first
    let cached = await this.cacheService.get<QrCode>(
      `${this.CACHE_PREFIX}:id:${idOrToken}`,
    );

    // Try cache by token if ID cache miss
    if (!cached) {
      cached = await this.cacheService.get<QrCode>(
        `${this.CACHE_PREFIX}:token:${idOrToken}`,
      );
    }

    if (cached) {
      return cached;
    }

    const qrcode = await this.qrCodeRepository.findOne({
      where: [{ id: idOrToken }, { token: idOrToken }],
      relations: ['user'],
    });

    if (!qrcode) {
      throw new NotFoundException('Evento não encontrado (QR Code inválido).');
    }

    // Cache for future requests (both by ID and token)
    const ttl = this.calculateCacheTTL(qrcode.expirationDate);
    await this.cacheService.set(
      `${this.CACHE_PREFIX}:id:${qrcode.id}`,
      qrcode,
      ttl,
    );
    await this.cacheService.set(
      `${this.CACHE_PREFIX}:token:${qrcode.token}`,
      qrcode,
      ttl,
    );

    return qrcode;
  }

  async getAllQrCodes(
    take: number,
    skip: number,
    search: string,
    sort: string,
    order: 'ASC' | 'DESC',
    userId?: string,
  ): Promise<GetAllResponseDto<QrCode>> {
    const conditions: FindManyOptions<QrCode> = {
      take,
      skip,
      order: {
        [sort]: order,
      },
      relations: ['user'],
    };

    if (search) {
      conditions.where = {
        eventName: ILike(`%${search}%`),
      };
    }

    if (userId) {
      conditions.where = {
        ...(conditions.where as object),
        user: { id: userId } as any,
      };
    }

    const [items, count] = await this.qrCodeRepository.findAndCount(conditions);

    if (items.length == 0) {
      return { skip: null, total: 0, items };
    }
    const over = count - Number(take) - Number(skip);
    skip = over <= 0 ? null : Number(skip) + Number(take);

    return { skip, total: count, items };
  }

  async getQrCodeByToken(token: string): Promise<QrCode> {
    // Try cache first
    const cacheKey = `${this.CACHE_PREFIX}:token:${token}`;
    const cached = await this.cacheService.get<QrCode>(cacheKey);

    if (cached) {
      return cached;
    }

    const qrcode = await this.qrCodeRepository.findOne({
      where: { token },
      relations: ['user'],
    });

    if (!qrcode) {
      throw new NotFoundException('qrcode not found');
    }

    // Cache for future requests
    const ttl = this.calculateCacheTTL(qrcode.expirationDate);
    await this.cacheService.set(cacheKey, qrcode, ttl);

    return qrcode;
  }

  async getUsersQrStatusCounts(userIds: string[]): Promise<{
    active: number;
    expired: number;
    none: number;
  }> {
    const ids = Array.from(new Set((userIds || []).filter(Boolean)));
    if (ids.length === 0) return { active: 0, expired: 0, none: 0 };

    // Cache key based on sorted user IDs for consistency
    const cacheKey = `${this.CACHE_PREFIX}:stats:${ids.sort().join(',')}`;
    const cached = await this.cacheService.get<{
      active: number;
      expired: number;
      none: number;
    }>(cacheKey);

    if (cached) {
      return cached;
    }

    const qrcodes = await this.qrCodeRepository.find({
      where: { user: { id: In(ids) } },
      relations: ['user'],
    });

    const now = Date.now();
    let active = 0;
    let expired = 0;
    const usersWithQr = new Set<string>();

    for (const qr of qrcodes) {
      if (qr.user) {
        usersWithQr.add((qr.user as any).id);
      }

      if (qr.expirationDate && qr.expirationDate.getTime() > now) {
        active++;
      } else {
        expired++;
      }
    }

    const none = ids.length - usersWithQr.size;
    const result = { active, expired, none };

    // Cache stats for 5 minutes
    await this.cacheService.set(cacheKey, result, 300);

    return result;
  }

  async getQrCodesByStatus(
    take: number,
    skip: number,
    status: 'active' | 'expired',
    sort: string,
    order: 'ASC' | 'DESC',
  ): Promise<GetAllResponseDto<QrCode>> {
    const now = new Date();

    const dateCondition =
      status === 'active' ? MoreThan(now) : LessThanOrEqual(now);

    const where: FindOptionsWhere<QrCode> = {
      expirationDate: dateCondition,
    };

    const conditions: FindManyOptions<QrCode> = {
      take,
      skip,
      order: {
        [sort]: order,
      },
      relations: ['user'],
      where: where,
      select: {
        id: true,
        createdAt: true,
        active: true,
        token: true,
        eventName: true,
        descriptionEvent: true,
        expirationDate: true,
        user: {
          id: true,
          name: true,
          email: true,
          phone: true,
          lastLogin: true,
        },
      },
    };

    const [items, count] = await this.qrCodeRepository.findAndCount(conditions);

    if (items.length === 0) {
      return { skip: null, total: 0, items };
    }

    const over = count - Number(take) - Number(skip);
    const nextSkip = over <= 0 ? null : Number(skip) + Number(take);

    return { skip: nextSkip, total: count, items };
  }

  private resolveExpirationDate(
    expirationDate: string | Date | null | undefined,
  ): Date | undefined {
    if (expirationDate === null || expirationDate === undefined)
      return undefined;

    const TZ = 'America/Sao_Paulo';
    let candidate: Date;

    if (typeof expirationDate === 'string') {
      candidate = fromZonedTime(expirationDate, TZ);
    } else if (expirationDate instanceof Date) {
      candidate = expirationDate;
    } else {
      throw new BadRequestException('invalid expirationDate');
    }

    if (!isValid(candidate)) {
      throw new BadRequestException('invalid expirationDate');
    }
    if (candidate.getTime() <= Date.now()) {
      throw new BadRequestException('expirationDate must be in the future');
    }

    return candidate;
  }

  /**
   * Calculate cache TTL based on QR code expiration
   * If expiration is set, cache until expiration (max 1 hour)
   * If no expiration, cache for default TTL (1 hour)
   */
  private calculateCacheTTL(expirationDate: Date | null): number {
    if (!expirationDate) {
      return this.CACHE_TTL;
    }

    const now = Date.now();
    const expiresIn = Math.floor((expirationDate.getTime() - now) / 1000);

    // If already expired or expiring soon, cache for 5 minutes
    if (expiresIn <= 0) {
      return 300;
    }

    // Cache until expiration, but max 1 hour
    return Math.min(expiresIn, this.CACHE_TTL);
  }

  /**
   * Invalidate all cache entries for a specific QR code
   */
  private async invalidateQrCodeCache(
    id: string,
    token: string,
  ): Promise<void> {
    await this.cacheService.del(`${this.CACHE_PREFIX}:id:${id}`);
    await this.cacheService.del(`${this.CACHE_PREFIX}:token:${token}`);
    await this.cacheService.delByPattern(`${this.CACHE_PREFIX}:stats:*`);
  }
}

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

@Injectable()
export class QrcodeService {
  constructor(
    @InjectRepository(QrCode)
    private readonly qrCodeRepository: Repository<QrCode>,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
  ) {}

  async createQrCode(
    createQrcodeDto: CreateQrcodeDto,
  ): Promise<{ qrCode: QrCode; qrCodeImage: string }> {
    const { userId, expirationDate, eventName, descriptionEvent } =
      createQrcodeDto;

    await this.userService.getUserById(userId);
    const token = uuidv4();
    const expirationUtc = this.resolveExpirationDate(expirationDate);

    const qrCode = this.qrCodeRepository.create({
      token,
      eventName,
      descriptionEvent,
      user: { id: userId } as any,
      ...(expirationUtc ? { expirationDate: expirationUtc } : {}),
    });

    const savedQrCode = await this.qrCodeRepository.save(qrCode);
    const qrData = `https://event-snap-production.up.railway.app/${token}`;
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

    return await this.qrCodeRepository.save(qrcode);
  }

  async getQrCodeById(qrCodeId: string): Promise<QrCode> {
    const qrcode = await this.qrCodeRepository.findOne({
      where: { id: qrCodeId },
      relations: ['user'],
    });

    if (!qrcode) {
      throw new NotFoundException('qrcode not found');
    }

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
    const qrcode = await this.qrCodeRepository.findOne({
      where: { token },
      relations: ['user'],
    });

    if (!qrcode) {
      throw new NotFoundException('qrcode not found');
    }

    return qrcode;
  }

  async getUsersQrStatusCounts(userIds: string[]): Promise<{
    active: number;
    expired: number;
    none: number;
  }> {
    const ids = Array.from(new Set((userIds || []).filter(Boolean)));
    if (ids.length === 0) return { active: 0, expired: 0, none: 0 };

    const qrcodes = await this.qrCodeRepository.find({
      where: { user: { id: In(ids) } },
      relations: ['user'],
    });

    const now = Date.now();
    const status = new Map<string, { any: boolean; active: boolean }>();
    for (const id of ids) status.set(id, { any: false, active: false });

    for (const qr of qrcodes) {
      const uid = (qr.user as any).id;
      const rec = status.get(uid);
      if (!rec) continue;
      rec.any = true;
      if (qr.expirationDate && qr.expirationDate.getTime() > now)
        rec.active = true;
    }

    let active = 0,
      expired = 0,
      none = 0;
    for (const rec of status.values()) {
      if (rec.active) active++;
      else if (rec.any) expired++;
      else none++;
    }

    return { active, expired, none };
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
}

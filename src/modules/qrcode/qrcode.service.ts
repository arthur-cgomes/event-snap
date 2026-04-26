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
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { QrCode } from './entity/qrcode.entity';
import { CreateQrcodeDto } from './dto/create-qrcode.dto';
import * as QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 40);
}
import { fromZonedTime } from 'date-fns-tz';
import { isValid } from 'date-fns';
import { GetAllResponseDto } from '../../common/dto/get-all.dto';
import { UpdateQrcodeDto } from './dto/update-qrcode.dto';
import { CacheService } from '../../common/services/cache.service';
import { User } from '../user/entity/user.entity';
import { UserType } from '../../common/enum/user-type.enum';
import { UserService } from '../user/user.service';
import { UserCreatedEvent } from '../../common/events/user-created.event';
import { QrCodeType } from '../../common/enum/qrcode-type.enum';
import { QrCodePlan } from '../../common/enum/qrcode-plan.enum';
import { APP_CONSTANTS } from '../../common/constants';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class QrcodeService {
  private readonly CACHE_PREFIX = 'qrcode';
  private readonly CACHE_TTL = 3600;

  constructor(
    @InjectRepository(QrCode)
    private readonly qrCodeRepository: Repository<QrCode>,
    private readonly userService: UserService,
    private readonly cacheService: CacheService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  @OnEvent('user.created')
  async handleUserCreated(event: UserCreatedEvent) {
    await this.generateWelcomeQrCode(event.userId);
  }

  private async generateWelcomeQrCode(userId: string): Promise<void> {
    const expirationDate = new Date();
    expirationDate.setDate(
      expirationDate.getDate() + APP_CONSTANTS.QR_CODE_EXPIRATION_DAYS,
    );

    try {
      await this.createQrCode({
        userId,
        eventName: '1️⃣ QR Code Grátis!',
        descriptionEvent:
          'QR Code gratuito gerado automaticamente, você pode alterá-lo a qualquer momento.',
        type: QrCodeType.FREE,
        plan: QrCodePlan.FREE,
        expirationDate: expirationDate,
      });
    } catch (error) {
      throw new BadRequestException('error creating automatic QR code', {
        cause: error,
      });
    }
  }

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
      plan = QrCodePlan.FREE,
      eventLocation,
      eventDateTime,
      dressCode,
      eventTheme,
      coverImageUrl,
      recommendations,
      uploadEnabled,
      galleryEnabled,
    } = createQrcodeDto;

    await this.userService.getUserById(userId);
    const token = uuidv4();
    const slug = slugify(eventName || 'evento');
    const storagePrefix = `${slug}-${token.substring(0, 8)}`;
    const expirationUtc =
      expirationDate !== undefined
        ? this.resolveExpirationDate(expirationDate)
        : this.getDefaultExpirationDateForPlan(plan);

    const qrCode = this.qrCodeRepository.create({
      token,
      storagePrefix,
      eventName,
      descriptionEvent,
      user: { id: userId } as any,
      ...(expirationUtc ? { expirationDate: expirationUtc } : {}),
      eventColor,
      type,
      plan,
      eventLocation,
      eventDateTime:
        eventDateTime && typeof eventDateTime === 'string'
          ? new Date(eventDateTime)
          : eventDateTime,
      dressCode,
      eventTheme,
      coverImageUrl,
      recommendations,
      uploadEnabled: uploadEnabled ?? false,
      galleryEnabled: galleryEnabled ?? false,
    });

    const savedQrCode = await this.qrCodeRepository.save(qrCode);

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

    await this.cacheService.delByPattern(
      `${this.CACHE_PREFIX}:user:${userId}:*`,
    );

    const frontendUrl = process.env.FRONTEND_URL || 'localhost3001';
    const qrData = `${frontendUrl}/#/event/${token}`;

    const qrCodeImage = await QRCode.toDataURL(qrData);

    return { qrCode: savedQrCode, qrCodeImage };
  }

  async updateQrCode(
    qrCodeId: string,
    updateQrcodeDto: UpdateQrcodeDto,
    user: User,
  ): Promise<QrCode> {
    const qrcode = await this.getQrCodeById(qrCodeId);

    if (qrcode.user?.id !== user.id && user.userType !== UserType.ADMIN) {
      throw new ForbiddenException(
        'You do not have permission to update this QR code',
      );
    }

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

    if (updateQrcodeDto.plan !== undefined) {
      qrcode.plan = updateQrcodeDto.plan;
    }

    if (updateQrcodeDto.uploadEnabled !== undefined) {
      qrcode.uploadEnabled = updateQrcodeDto.uploadEnabled;
    }

    const isPaidPlan =
      qrcode.plan === QrCodePlan.PARTY || qrcode.plan === QrCodePlan.CORPORATE;

    if (isPaidPlan) {
      if (updateQrcodeDto.eventLocation !== undefined) {
        qrcode.eventLocation = updateQrcodeDto.eventLocation;
      }

      if (updateQrcodeDto.eventDateTime !== undefined) {
        qrcode.eventDateTime = new Date(updateQrcodeDto.eventDateTime);
      }

      if (updateQrcodeDto.dressCode !== undefined) {
        qrcode.dressCode = updateQrcodeDto.dressCode;
      }

      if (updateQrcodeDto.eventTheme !== undefined) {
        qrcode.eventTheme = updateQrcodeDto.eventTheme;
      }

      if (updateQrcodeDto.coverImageUrl !== undefined) {
        qrcode.coverImageUrl = updateQrcodeDto.coverImageUrl;
      }

      if (updateQrcodeDto.recommendations !== undefined) {
        qrcode.recommendations = updateQrcodeDto.recommendations;
      }

      if (updateQrcodeDto.galleryEnabled !== undefined) {
        qrcode.galleryEnabled = updateQrcodeDto.galleryEnabled;
      }

      if (typeof updateQrcodeDto.eventColor === 'string') {
        qrcode.eventColor = updateQrcodeDto.eventColor;
      }
    }

    const updated = await this.qrCodeRepository.save(qrcode);

    await this.invalidateQrCodeCache(updated.id, updated.token);

    return updated;
  }

  async getQrCodeById(idOrToken: string): Promise<QrCode> {
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

    const ttl = this.calculateCacheTTL(qrcode.expirationDate);
    await this.cacheService.set(cacheKey, qrcode, ttl);

    return qrcode;
  }

  async getQrCodeByIdOrToken(idOrToken: string): Promise<QrCode> {
    let cached = await this.cacheService.get<QrCode>(
      `${this.CACHE_PREFIX}:id:${idOrToken}`,
    );

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

    if (qrcode.expirationDate && new Date() > new Date(qrcode.expirationDate)) {
      throw new NotFoundException('qrcode not found');
    }

    const ttl = this.calculateCacheTTL(qrcode.expirationDate);
    await this.cacheService.set(cacheKey, qrcode, ttl);

    this.qrCodeRepository.increment({ token }, 'viewCount', 1).catch(() => {});

    return qrcode;
  }

  async getUsersQrStatusCounts(userIds: string[]): Promise<{
    active: number;
    expired: number;
    none: number;
  }> {
    const ids = Array.from(new Set((userIds || []).filter(Boolean)));
    if (ids.length === 0) return { active: 0, expired: 0, none: 0 };

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

  private getDefaultExpirationDateForPlan(plan: QrCodePlan): Date {
    const expirationDate = new Date();
    switch (plan) {
      case QrCodePlan.FREE:
        expirationDate.setDate(
          expirationDate.getDate() + APP_CONSTANTS.QR_CODE_EXPIRATION_DAYS,
        );
        break;
      case QrCodePlan.PARTY:
        expirationDate.setDate(
          expirationDate.getDate() + APP_CONSTANTS.PARTY_EXPIRATION_DAYS,
        );
        break;
      case QrCodePlan.CORPORATE:
        expirationDate.setDate(
          expirationDate.getDate() + APP_CONSTANTS.CORPORATE_EXPIRATION_DAYS,
        );
        break;
    }
    return expirationDate;
  }

  private calculateCacheTTL(expirationDate: Date | null): number {
    if (!expirationDate) {
      return this.CACHE_TTL;
    }

    const now = Date.now();
    const expiresIn = Math.floor((expirationDate.getTime() - now) / 1000);

    if (expiresIn <= 0) {
      return 300;
    }

    return Math.min(expiresIn, this.CACHE_TTL);
  }

  private async invalidateQrCodeCache(
    id: string,
    token: string,
  ): Promise<void> {
    await this.cacheService.del(`${this.CACHE_PREFIX}:id:${id}`);
    await this.cacheService.del(`${this.CACHE_PREFIX}:token:${token}`);
    await this.cacheService.delByPattern(`${this.CACHE_PREFIX}:stats:*`);
  }

  async updateLastUploadAt(qrCodeId: string): Promise<void> {
    await this.qrCodeRepository.update(qrCodeId, { lastUploadAt: new Date() });
  }

  async getQrCodeWithUser(qrCodeId: string): Promise<QrCode> {
    return this.qrCodeRepository.findOne({
      where: { id: qrCodeId },
      relations: ['user'],
    });
  }

  async getEventAnalytics(qrCodeId: string): Promise<{
    viewCount: number;
    firstUploadAt: Date | null;
    lastUploadAt: Date | null;
    totalUploads: number;
  }> {
    const qrCode = await this.qrCodeRepository.findOne({
      where: { id: qrCodeId },
      relations: ['uploads'],
    });

    if (!qrCode) {
      throw new NotFoundException('QR Code not found');
    }

    const activeUploads = (qrCode.uploads || []).filter((u) => !u.deletedAt);
    const sortedByDate = activeUploads
      .filter((u) => u.createdAt)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );

    return {
      viewCount: qrCode.viewCount || 0,
      firstUploadAt:
        sortedByDate.length > 0 ? new Date(sortedByDate[0].createdAt) : null,
      lastUploadAt: qrCode.lastUploadAt || null,
      totalUploads: activeUploads.length,
    };
  }

  async sendInvites(
    qrCodeId: string,
    recipients: string[],
    channel: 'email' | 'whatsapp',
    user: any,
  ): Promise<{ sent: number; cost: number }> {
    const qrCode = await this.getQrCodeById(qrCodeId);
    if (!qrCode) throw new NotFoundException('QR Code não encontrado');

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'localhost3001';
    const eventUrl = `${frontendUrl}/#/event/${qrCode.token}`;
    let sent = 0;
    const costPerUnit = channel === 'email' ? 0.02 : 0.4;

    if (channel === 'email') {
      for (const email of recipients) {
        try {
          await this.emailService.sendEmail(
            email.trim(),
            `Você foi convidado para ${qrCode.eventName || 'um evento'} no FotoUai!`,
            `Olá! Você foi convidado para o evento "${qrCode.eventName}". Acesse: ${eventUrl}`,
            this.buildInviteEmailHtml(qrCode, eventUrl, user.name || ''),
          );
          sent++;
        } catch (err) {
          console.error(`Failed to send invite to ${email}:`, err);
        }
      }
    }

    return { sent, cost: sent * costPerUnit };
  }

  private buildInviteEmailHtml(
    qrCode: any,
    eventUrl: string,
    senderName: string,
  ): string {
    const details = [
      qrCode.eventDateTime
        ? `Data: ${new Date(qrCode.eventDateTime).toLocaleDateString('pt-BR')}`
        : '',
      qrCode.eventLocation ? `Local: ${qrCode.eventLocation}` : '',
      qrCode.dressCode ? `Traje: ${qrCode.dressCode}` : '',
    ]
      .filter(Boolean)
      .join('<br/>');

    return `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
        <div style="background: linear-gradient(135deg, #6366f1, #4f46e5); padding: 32px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">FotoUai</h1>
          <p style="color: #e0e7ff; margin: 8px 0 0; font-size: 14px;">Você foi convidado!</p>
        </div>
        <div style="padding: 32px 24px;">
          <p style="font-size: 16px; color: #1f2937; margin: 0 0 16px;">
            <strong>${senderName}</strong> convidou você para o evento:
          </p>
          <div style="background: #f5f3ff; border-radius: 8px; padding: 16px; margin: 0 0 24px;">
            <p style="font-size: 18px; color: #4f46e5; margin: 0 0 8px; font-weight: 700;">${qrCode.eventName || 'Evento'}</p>
            ${details ? `<p style="font-size: 13px; color: #6b7280; margin: 0; line-height: 1.8;">${details}</p>` : ''}
            ${qrCode.recommendations ? `<p style="font-size: 12px; color: #9ca3af; margin: 8px 0 0;">Dica: ${qrCode.recommendations}</p>` : ''}
          </div>
          <div style="text-align: center;">
            <a href="${eventUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 700; font-size: 15px;">
              Enviar Fotos
            </a>
          </div>
        </div>
        <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">© ${new Date().getFullYear()} FotoUai — Suas memórias, compartilhadas com facilidade.</p>
        </div>
      </div>
    `;
  }
}

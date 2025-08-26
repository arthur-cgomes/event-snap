import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, ILike, Repository } from 'typeorm';
import {
  BadRequestException,
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

@Injectable()
export class QrcodeService {
  constructor(
    @InjectRepository(QrCode)
    private readonly qrCodeRepository: Repository<QrCode>,
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
    const qrData = `https://eventsnap.com/upload/${token}`;
    const qrCodeImage = await QRCode.toDataURL(qrData);

    return { qrCode: savedQrCode, qrCodeImage };
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

  public async getAllQrCodes(
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
}

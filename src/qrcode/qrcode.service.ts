import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { QrCode } from './entity/qrcode.entity';
import { CreateQrcodeDto } from './dto/create-qrcode.dto';
import * as QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class QrcodeService {
  constructor(
    @InjectRepository(QrCode)
    private readonly qrCodeRepository: Repository<QrCode>,
  ) {}

  async createQrCode(
    createQrcodeDto: CreateQrcodeDto,
  ): Promise<{ qrCode: QrCode; qrCodeImage: string }> {
    const { userId, expirationDate, eventName, descriptionEvent } =
      createQrcodeDto;

    const token = uuidv4();

    const qrCode = this.qrCodeRepository.create({
      token,
      eventName,
      descriptionEvent,
      expirationDate,
      user: { id: userId },
    });

    const savedQrCode = await this.qrCodeRepository.save(qrCode);

    const qrData = `https://eventsnap.com/upload/${token}`;
    const qrCodeImage = await QRCode.toDataURL(qrData);

    return {
      qrCode: savedQrCode,
      qrCodeImage,
    };
  }

  async getQrCodeByToken(token: string): Promise<QrCode> {
    const qrcode = await this.qrCodeRepository.findOne({ where: { token } });

    if (!qrcode) {
      throw new NotFoundException('qrcode not found');
    }

    return qrcode;
  }
}

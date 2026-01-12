import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import * as path from 'path';
import sharp from 'sharp';
import { supabase } from '../config/supabase.config';
import { Upload } from './entity/upload.entity';
import { QrcodeService } from '../qrcode/qrcode.service';
import { QrCodeType } from '../common/enum/qrcode-type.enum';
import { CacheService } from '../common/services/cache.service';

@Injectable()
export class UploadService {
  private readonly CACHE_PREFIX = 'uploads';
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    @InjectRepository(Upload)
    private readonly uploadRepository: Repository<Upload>,
    private readonly qrCodeService: QrcodeService,
    private readonly cacheService: CacheService,
  ) {}

  async uploadImage(
    qrToken: string,
    file: Express.Multer.File,
  ): Promise<Upload> {
    const qrCode = await this.qrCodeService.getQrCodeByToken(qrToken);

    if (qrCode.type === QrCodeType.FREE) {
      const currentUploads = await this.countUploadsByQrCodeId(qrCode.id);

      if (currentUploads >= 10) {
        throw new ForbiddenException('upload limit reached for free QR code');
      }
    }

    if (!file) {
      throw new BadRequestException('file expected');
    }

    let optimizedBuffer: Buffer;
    let mimeType = file.mimetype;
    let fileExt = path.extname(file.originalname);

    if (file.mimetype.startsWith('image/')) {
      try {
        optimizedBuffer = await sharp(file.buffer)
          .resize({ width: 2000, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();

        mimeType = 'image/webp';
        fileExt = '.webp';
      } catch (error) {
        optimizedBuffer = file.buffer;
        console.error('sharp processing error, using original file:', error);
      }
    } else {
      optimizedBuffer = file.buffer;
    }

    const base = path.basename(
      file.originalname || 'upload.bin',
      path.extname(file.originalname),
    );
    const sanitized = base.replace(/[^\w.\-]/g, '_');
    const objectKey = `${qrToken}/${Date.now()}-${sanitized}${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('event-snap')
      .upload(objectKey, optimizedBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      throw new BadRequestException(`error uploading: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from('event-snap')
      .getPublicUrl(objectKey);

    const upload = this.uploadRepository.create({
      fileUrl: publicUrlData.publicUrl,
      qrCode,
    });

    const savedUpload = await this.uploadRepository.save(upload);

    await this.cacheService.delByPattern(`${this.CACHE_PREFIX}:${qrToken}:*`);
    await this.cacheService.del(`${this.CACHE_PREFIX}:count:${qrCode.id}`);

    return savedUpload;
  }

  async getFileUrlsByToken(
    qrToken: string,
    userId: string,
    take: number = 20,
    skip: number = 0,
  ): Promise<{ items: string[]; total: number; skip: number | null }> {
    const qrCode = await this.qrCodeService.getQrCodeByToken(qrToken);
    if (!qrCode) throw new NotFoundException('qrcode not found');

    if (qrCode.user && qrCode.user.id !== userId) {
      throw new ForbiddenException('no permission');
    }

    const cacheKey = `${this.CACHE_PREFIX}:${qrToken}:page:${take}:${skip}`;
    const cached = await this.cacheService.get<{
      items: string[];
      total: number;
      skip: number | null;
    }>(cacheKey);

    if (cached) {
      return cached;
    }

    const [uploads, total] = await this.uploadRepository.findAndCount({
      where: { qrCode: { token: qrToken }, deletedAt: IsNull() },
      select: ['fileUrl'],
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    const items = uploads.map((u) => u.fileUrl);
    const over = total - Number(take) - Number(skip);
    const nextSkip = over <= 0 ? null : Number(skip) + Number(take);

    const result = { items, total, skip: nextSkip };

    await this.cacheService.set(cacheKey, result, this.CACHE_TTL);

    return result;
  }

  async countUploadsByQrCodeId(qrCodeId: string): Promise<number> {
    const cacheKey = `${this.CACHE_PREFIX}:count:${qrCodeId}`;
    const cached = await this.cacheService.get<number>(cacheKey);

    if (cached !== null) {
      return cached;
    }

    const count = await this.uploadRepository.count({
      where: { qrCode: { id: qrCodeId } },
    });

    await this.cacheService.set(cacheKey, count, this.CACHE_TTL);

    return count;
  }

  async deleteFiles(filesUrls: string[]): Promise<void> {
    if (!filesUrls || filesUrls.length === 0) {
      return;
    }

    const files = await this.uploadRepository.find({
      where: { fileUrl: In(filesUrls) },
      relations: ['qrCode'],
    });

    if (files.length > 0) {
      await this.uploadRepository.update(
        { fileUrl: In(filesUrls) },
        { deletedAt: new Date() },
      );

      const qrTokens = new Set(
        files.map((f) => f.qrCode?.token).filter(Boolean),
      );
      const qrIds = new Set(files.map((f) => f.qrCode?.id).filter(Boolean));

      for (const token of qrTokens) {
        await this.cacheService.delByPattern(`${this.CACHE_PREFIX}:${token}:*`);
      }

      for (const id of qrIds) {
        await this.cacheService.del(`${this.CACHE_PREFIX}:count:${id}`);
      }
    }
  }
}

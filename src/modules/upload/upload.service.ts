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
import { supabase } from '../../common/config/supabase.config';
import { Upload } from './entity/upload.entity';
import { QrcodeService } from '../qrcode/qrcode.service';
import { QrCodeType } from '../../common/enum/qrcode-type.enum';
import { CacheService } from '../../common/services/cache.service';
import { APP_CONSTANTS } from '../../common/constants';

@Injectable()
export class UploadService {
  private readonly CACHE_PREFIX = 'uploads';
  private readonly CACHE_TTL = 300;

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

      if (currentUploads >= APP_CONSTANTS.MAX_FILES_FREE_QRCODE) {
        throw new ForbiddenException('upload limit reached for free QR code');
      }
    }

    if (!file) {
      throw new BadRequestException('file expected');
    }

    const IMAGE_SIGNATURES: { mime: string; bytes: number[] }[] = [
      { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
      { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
      { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46] },
      { mime: 'image/gif', bytes: [0x47, 0x49, 0x46] },
      { mime: 'image/heic', bytes: [0x00, 0x00, 0x00] },
    ];

    const fileHeader = Array.from(file.buffer.subarray(0, 12));
    const isValidImage = IMAGE_SIGNATURES.some((sig) =>
      sig.bytes.every((byte, i) => fileHeader[i] === byte),
    );

    const isValidVideo = this.isVideoFile(file.buffer);

    if (!isValidImage && !isValidVideo) {
      throw new BadRequestException(
        'Invalid file type. Allowed: JPEG, PNG, WebP, GIF, HEIC, MP4, MOV, WebM.',
      );
    }

    if (isValidVideo && qrCode.type === QrCodeType.FREE) {
      throw new ForbiddenException(
        'Video uploads require a Premium event. Upgrade to upload videos.',
      );
    }

    if (
      isValidVideo &&
      file.buffer.length > APP_CONSTANTS.VIDEO_MAX_SIZE_BYTES
    ) {
      throw new BadRequestException(
        `Video exceeds maximum size of ${APP_CONSTANTS.VIDEO_MAX_SIZE_BYTES / (1024 * 1024)}MB.`,
      );
    }

    let optimizedBuffer: Buffer;
    let mimeType = file.mimetype;
    let fileExt = path.extname(file.originalname);

    if (file.mimetype.startsWith('image/')) {
      try {
        optimizedBuffer = await sharp(file.buffer)
          .resize({
            width: APP_CONSTANTS.IMAGE_MAX_WIDTH,
            withoutEnlargement: true,
          })
          .webp({ quality: APP_CONSTANTS.IMAGE_QUALITY })
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
      .from('fotouai')
      .upload(objectKey, optimizedBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      throw new BadRequestException(`error uploading: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from('fotouai')
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

  private isVideoFile(buffer: Buffer): boolean {
    const header = Array.from(buffer.subarray(0, 12));

    const isMp4OrMov =
      header[4] === 0x66 &&
      header[5] === 0x74 &&
      header[6] === 0x79 &&
      header[7] === 0x70;

    const isWebm =
      header[0] === 0x1a &&
      header[1] === 0x45 &&
      header[2] === 0xdf &&
      header[3] === 0xa3;

    return isMp4OrMov || isWebm;
  }

  private extractPathFromUrl(url: string): string {
    const bucketName = process.env.SUPABASE_BUCKET || 'fotouai';
    const idx = url.indexOf(`/storage/v1/object/public/${bucketName}/`);
    if (idx !== -1) {
      return url.substring(
        idx + `/storage/v1/object/public/${bucketName}/`.length,
      );
    }
    return url;
  }

  private async getSignedUrl(filePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET || 'fotouai')
      .createSignedUrl(filePath, 3600);

    if (error || !data?.signedUrl) {
      const { data: publicData } = supabase.storage
        .from(process.env.SUPABASE_BUCKET || 'fotouai')
        .getPublicUrl(filePath);
      return publicData.publicUrl;
    }

    return data.signedUrl;
  }

  async getSignedUrls(urls: string[]): Promise<string[]> {
    return Promise.all(
      urls.map(async (url) => {
        try {
          const path = this.extractPathFromUrl(url);
          return await this.getSignedUrl(path);
        } catch {
          return url;
        }
      }),
    );
  }

  async getFileUrlsByToken(
    qrToken: string,
    userId: string,
    take: number = 20,
    skip: number = 0,
  ): Promise<{ items: string[]; total: number; skip: number | null }> {
    const qrCode = await this.qrCodeService.getQrCodeByToken(qrToken);
    if (!qrCode) throw new NotFoundException('qrcode not found');

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
      select: ['id', 'fileUrl', 'createdAt'],
      order: { createdAt: 'DESC' },
      take,
      skip,
    });

    const publicUrls = uploads.map((u) => u.fileUrl);
    const items = await this.getSignedUrls(publicUrls);
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

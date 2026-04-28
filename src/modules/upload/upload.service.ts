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
import { DispatcherEmailService } from '../dispatcher-email/dispatcher-email.service';
import { QrCodeType } from '../../common/enum/qrcode-type.enum';
import { QrCodePlan } from '../../common/enum/qrcode-plan.enum';
import { CacheService } from '../../common/services/cache.service';
import { APP_CONSTANTS } from '../../common/constants';

@Injectable()
export class UploadService {
  private readonly CACHE_PREFIX = 'uploads';
  private readonly CACHE_TTL = 300;
  private readonly bucket = process.env.SUPABASE_BUCKET || 'FotoUai-Storage';

  constructor(
    @InjectRepository(Upload)
    private readonly uploadRepository: Repository<Upload>,
    private readonly qrCodeService: QrcodeService,
    private readonly dispatcherEmailService: DispatcherEmailService,
    private readonly cacheService: CacheService,
  ) {}

  async uploadImage(
    qrToken: string,
    file: Express.Multer.File,
  ): Promise<Upload> {
    const qrCode = await this.qrCodeService.getQrCodeByToken(qrToken);

    if (!qrCode.uploadEnabled) {
      throw new ForbiddenException('upload limit reached');
    }

    const currentUploads = await this.countUploadsByQrCodeId(qrCode.id);
    const maxUploads = this.getMaxUploadsForPlan(qrCode.plan);

    if (maxUploads !== null && currentUploads >= maxUploads) {
      throw new ForbiddenException(
        `upload limit reached for ${qrCode.plan} plan`,
      );
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
    const folderPrefix = qrCode.storagePrefix || qrToken;
    const objectKey = `${folderPrefix}/${Date.now()}-${sanitized}${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from(this.bucket)
      .upload(objectKey, optimizedBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      throw new BadRequestException(`error uploading: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from(this.bucket)
      .getPublicUrl(objectKey);

    const upload = this.uploadRepository.create({
      fileUrl: publicUrlData.publicUrl,
      qrCode,
    });

    const savedUpload = await this.uploadRepository.save(upload);

    if (currentUploads === 0) {
      try {
        const qrWithUser = await this.qrCodeService.getQrCodeWithUser(
          qrCode.id,
        );
        if (
          qrWithUser?.user?.email &&
          qrWithUser.user.notifyOnUpload !== false
        ) {
          const frontendUrl = process.env.FRONTEND_URL || 'localhost3001';
          await this.dispatcherEmailService.sendEmail(
            qrWithUser.user.email,
            'FotoUai — Seu evento recebeu a primeira foto! 📸',
            `Olá ${qrWithUser.user.name || ''}! Seu evento "${qrCode.eventName || 'Seu Evento'}" acabou de receber a primeira foto. Acesse seu dashboard para conferir!`,
            this.buildFirstUploadHtml(
              qrWithUser.user.name || '',
              qrCode.eventName || 'Seu Evento',
              frontendUrl,
            ),
          );
        }
      } catch (emailErr) {
        console.error('Failed to send first upload notification:', emailErr);
      }
    }

    await this.cacheService.delByPattern(`${this.CACHE_PREFIX}:${qrToken}:*`);
    await this.cacheService.del(`${this.CACHE_PREFIX}:count:${qrCode.id}`);

    this.qrCodeService.updateLastUploadAt(qrCode.id).catch(() => {});

    return savedUpload;
  }

  private getMaxUploadsForPlan(plan: QrCodePlan): number | null {
    switch (plan) {
      case QrCodePlan.FREE:
        return APP_CONSTANTS.MAX_FILES_FREE_QRCODE;
      case QrCodePlan.PARTY:
        return APP_CONSTANTS.MAX_FILES_PARTY_QRCODE;
      case QrCodePlan.CORPORATE:
        return null;
      default:
        return APP_CONSTANTS.MAX_FILES_FREE_QRCODE;
    }
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
    const bucketName = this.bucket;
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
      .from(this.bucket)
      .createSignedUrl(filePath, 3600);

    if (error || !data?.signedUrl) {
      const { data: publicData } = supabase.storage
        .from(this.bucket)
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

  async getGalleryByToken(
    qrToken: string,
    take: number = 20,
    skip: number = 0,
  ): Promise<{ items: string[]; total: number; skip: number | null }> {
    const qrCode = await this.qrCodeService.getQrCodeByToken(qrToken);
    if (!qrCode) throw new NotFoundException('qrcode not found');
    if (!qrCode.galleryEnabled)
      throw new ForbiddenException('Gallery is not enabled for this event');

    const cacheKey = `${this.CACHE_PREFIX}:gallery:${qrToken}:${take}:${skip}`;
    const cached = await this.cacheService.get<{
      items: string[];
      total: number;
      skip: number | null;
    }>(cacheKey);
    if (cached) return cached;

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

  private buildFirstUploadHtml(
    userName: string,
    eventName: string,
    frontendUrl: string,
  ): string {
    return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, #14b8a6, #0d9488); padding: 32px 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700;">FotoUai</h1>
        <p style="color: #ccfbf1; margin: 8px 0 0; font-size: 14px;">Primeira foto recebida!</p>
      </div>
      <div style="padding: 32px 24px;">
        <p style="font-size: 16px; color: #1f2937; margin: 0 0 16px;">Olá <strong>${userName}</strong>,</p>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.6; margin: 0 0 24px;">
          Ótimas notícias! Seu evento <strong>"${eventName}"</strong> acabou de receber a primeira foto. Os convidados estão compartilhando momentos especiais!
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${frontendUrl}/#/dashboard" style="display: inline-block; background: linear-gradient(135deg, #14b8a6, #0d9488); color: white; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; font-size: 14px;">
            Ver no Dashboard
          </a>
        </div>
        <p style="font-size: 13px; color: #9ca3af; line-height: 1.5; margin: 24px 0 0;">
          Você receberá esta notificação apenas uma vez por evento.
        </p>
      </div>
      <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">© ${new Date().getFullYear()} FotoUai — Suas memórias, compartilhadas com facilidade.</p>
      </div>
    </div>
  `;
  }
}

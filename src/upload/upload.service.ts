import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as path from 'path';
import sharp from 'sharp';
import { supabase } from '../config/supabase.config';
import { Upload } from './entity/upload.entity';
import { QrcodeService } from '../qrcode/qrcode.service';
import { QrCodeType } from '../common/enum/qrcode-type.enum';

@Injectable()
export class UploadService {
  constructor(
    @InjectRepository(Upload)
    private readonly uploadRepository: Repository<Upload>,
    private readonly qrCodeService: QrcodeService,
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

    // Lógica de otimização com Sharp
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

    // Geração do nome do arquivo
    const base = path.basename(
      file.originalname || 'upload.bin',
      path.extname(file.originalname),
    );
    const sanitized = base.replace(/[^\w.\-]/g, '_');
    const objectKey = `${qrToken}/${Date.now()}-${sanitized}${fileExt}`;

    // 2. Uso da instância importada 'supabase'
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

    return this.uploadRepository.save(upload);
  }

  async getFileUrlsByToken(qrToken: string, userId: string): Promise<string[]> {
    const qrCode = await this.qrCodeService.getQrCodeByToken(qrToken);
    if (!qrCode) throw new NotFoundException('qr code not found');

    // Validação de permissão (se necessário descomentar e ajustar)
    if (qrCode.user && qrCode.user.id !== userId) {
      // throw new ForbiddenException('no permission');
    }

    const uploads = await this.uploadRepository.find({
      where: { qrCode: { token: qrToken } },
      select: ['fileUrl'],
      order: { createdAt: 'DESC' },
    });

    return uploads.map((u) => u.fileUrl);
  }

  async countUploadsByQrCodeId(qrCodeId: string): Promise<number> {
    return this.uploadRepository.count({
      where: { qrCode: { id: qrCodeId } },
    });
  }

  async deleteFiles(filesUrls: string[]): Promise<void> {
    if (!filesUrls || filesUrls.length === 0) {
      return;
    }

    const files = await this.uploadRepository.find({
      where: { fileUrl: In(filesUrls) },
    });

    if (files.length > 0) {
      await this.uploadRepository.remove(files);
    }

    const pathsToDelete = filesUrls.map((url) => this.extractPathFromUrl(url));

    const { error: deleteError } = await supabase.storage
      .from('event-snap')
      .remove(pathsToDelete);

    if (deleteError) {
      console.error('error deleting files from storage', deleteError);
      throw new BadRequestException(
        `error deleting files from storage: ${deleteError.message}`,
      );
    }
  }

  private extractPathFromUrl(url: string): string {
    const bucketName = 'event-snap';

    const parts = url.split(`/${bucketName}/`);

    if (parts.length < 2) {
      console.warn(`error extracting path from url: ${url}`);
      return url;
    }

    return parts[1];
  }
}

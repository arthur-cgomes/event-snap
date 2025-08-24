import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Upload } from './entity/upload.entity';
import { supabase } from '../config/supabase.config';
import { QrcodeService } from '../qrcode/qrcode.service';
import * as path from 'path';

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

    if (!file) {
      throw new BadRequestException(
        'file not sent expected "file" field in multipart/form-data',
      );
    }

    const base = path.basename(file.originalname || 'upload.bin');
    const sanitized = base.replace(/[^\w.\-]/g, '_');
    const objectKey = `${qrToken}/${Date.now()}-${sanitized}`;

    const buffer = file.buffer;
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('file buffer is empty');
    }

    const { error: uploadError } = await supabase.storage
      .from('event-snap')
      .upload(objectKey, buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      throw new BadRequestException(
        `error uploading file: ${uploadError.message}`,
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from('event-snap')
      .getPublicUrl(objectKey);

    const upload = this.uploadRepository.create({
      imageUrl: publicUrlData.publicUrl,
      qrCode,
    });

    return this.uploadRepository.save(upload);
  }

  async getUploadByQrCodeId(
    qrToken: string,
    userId: string,
  ): Promise<Upload[]> {
    const uploads = await this.uploadRepository.find({
      where: { qrCode: { token: qrToken, user: { id: userId } } },
      relations: { qrCode: true },
    });

    if (!uploads) {
      throw new NotFoundException('uploads not found');
    }

    return uploads;
  }

  async getFileUrlsByToken(qrToken: string, userId: string): Promise<string[]> {
    const qrCode = await this.qrCodeService.getQrCodeByToken(qrToken);

    if (!qrCode) {
      throw new NotFoundException('qr code not found');
    }
    if (!qrCode.user || qrCode.user.id !== userId) {
      throw new ForbiddenException(
        'you do not have permission to access this qr code',
      );
    }

    const bucket = 'event-snap';
    const folder = qrToken;

    const pageSize = 1000;
    let offset = 0;
    const urls: string[] = [];

    while (true) {
      const { data: entries, error: listErr } = await supabase.storage
        .from(bucket)
        .list(folder, { limit: pageSize, offset });

      if (listErr) {
        throw new ServiceUnavailableException(
          `error listing files: ${listErr.message}`,
        );
      }
      if (!entries || entries.length === 0) break;

      const batch = await Promise.all(
        entries
          .filter((e) => e.name)
          .map(async (e) => {
            const path = `${folder}/${e.name}`;
            const { data, error } = await supabase.storage
              .from(bucket)
              .createSignedUrl(path, 30 * 24 * 60 * 60);

            if (error) {
              throw new ServiceUnavailableException(
                `error creating signed url for: ${e.name}: ${error.message}`,
              );
            }
            return data.signedUrl;
          }),
      );

      urls.push(...batch);
      if (entries.length < pageSize) break;
      offset += pageSize;
    }

    return urls;
  }
}

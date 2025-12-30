import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import sharp from 'sharp';
import { supabase } from '../config/supabase.config';
import { Upload } from './entity/upload.entity';
import { QrcodeService } from '../qrcode/qrcode.service';

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
        console.error('Sharp processing error, using original file:', error);
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
      imageUrl: publicUrlData.publicUrl,
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
      select: ['imageUrl'],
      order: { createdAt: 'DESC' },
    });

    return uploads.map((u) => u.imageUrl);
  }
}

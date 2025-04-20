import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Upload } from './entity/upload.entity';
import { supabase } from '../config/supabase.config';
import { QrcodeService } from '../qrcode/qrcode.service';

@Injectable()
export class UploadService {
  constructor(
    @InjectRepository(Upload)
    private readonly uploadRepository: Repository<Upload>,
    private readonly qrCodeService: QrcodeService,
  ) {}

  async uploadImage(token: string, file: Express.Multer.File): Promise<Upload> {
    const qrCode = await this.qrCodeService.getQrCodeByToken(token);

    const fileName = `${Date.now()}-${file.originalname}`;
    const { error } = await supabase.storage
      .from('event-snap')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from('uploads')
      .getPublicUrl(fileName);

    const upload = this.uploadRepository.create({
      imageUrl: publicUrlData.publicUrl,
      qrCode,
    });

    return await this.uploadRepository.save(upload);
  }
}

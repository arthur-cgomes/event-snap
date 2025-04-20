import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { UploadService } from './upload.service';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiParam,
  ApiTags,
  ApiOperation,
} from '@nestjs/swagger';

//@ApiBearerAuth()
@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  //@UseGuards(AuthGuard())
  @Post(':token')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Faz upload de imagem associada a um QR code' })
  @ApiParam({ name: 'token', required: true, description: 'Token do QR code' })
  @ApiConsumes('multipart/form-data')
  async uploadImage(
    @Param('token') token: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return await this.uploadService.uploadImage(token, file);
  }
}

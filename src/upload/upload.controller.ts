import {
  Controller,
  Post,
  Get,
  Param,
  UploadedFile,
  UseInterceptors,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { UploadService } from './upload.service';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { AuthGuard } from '@nestjs/passport';

@ApiBearerAuth()
@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @UseGuards(AuthGuard())
  @Post(':token')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  async uploadImage(
    @Param('token') token: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.uploadService.uploadImage(token, file);
  }

  @Get(':qrToken/:userId')
  async getUploadByQrCodeId(
    @Param('qrToken') qrToken: string,
    @Param('userId') userId: string,
  ) {
    return await this.uploadService.getUploadByQrCodeId(qrToken, userId);
  }

  @Get('files/storage/:token')
  @ApiOperation({
    summary: 'Listar URLs válidas dos arquivos do token (Supabase)',
  })
  @ApiQuery({ name: 'userId', required: true, type: String })
  @ApiOkResponse({ schema: { type: 'array', items: { type: 'string' } } })
  async getFileUrlsByToken(
    @Param('token') token: string,
    @Query('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<string[]> {
    return this.uploadService.getFileUrlsByToken(token, userId);
  }
}

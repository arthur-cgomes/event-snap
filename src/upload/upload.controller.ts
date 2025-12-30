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
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { AuthGuard } from '@nestjs/passport';

@ApiBearerAuth()
@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post(':token')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 60 * 1024 * 1024 },
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

  @UseGuards(AuthGuard())
  @Get(':token')
  @ApiOperation({
    summary: 'Listar URLs válidas dos arquivos do token',
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

import {
  Controller,
  Post,
  Get,
  Param,
  UploadedFile,
  UseInterceptors,
  Query,
  UseGuards,
  Delete,
  HttpCode,
  HttpStatus,
  Body,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { AuthGuard } from '@nestjs/passport';
import { DeleteFilesDto } from './dto/delete-files.dto';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../user/entity/user.entity';

@ApiBearerAuth()
@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post(':token')
  @Throttle({ default: { ttl: 60000, limit: 10 } }) // 10 uploads per minute
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
  @ApiResponse({
    status: 429,
    description: 'Too many requests. Rate limit exceeded (10 uploads/minute).',
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
    summary: 'Listar URLs válidas dos arquivos do token (paginado)',
  })
  @ApiQuery({ name: 'take', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'skip', required: false, type: Number, example: 0 })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'string' } },
        total: { type: 'number' },
        skip: { type: 'number', nullable: true },
      },
    },
  })
  async getFileUrlsByToken(
    @Param('token') token: string,
    @CurrentUser() user: User,
    @Query('take') take?: number,
    @Query('skip') skip?: number,
  ) {
    return this.uploadService.getFileUrlsByToken(
      token,
      user.id,
      take || 20,
      skip || 0,
    );
  }

  @UseGuards(AuthGuard())
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deleta múltiplos arquivos pela URL' })
  @ApiResponse({
    status: 204,
    description: 'Arquivos deletados com sucesso (nenhum conteúdo retornado).',
  })
  async deleteFiles(@Body() deleteFilesDto: DeleteFilesDto) {
    await this.uploadService.deleteFiles(deleteFilesDto.urls);
  }
}

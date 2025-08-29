import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { QrcodeService } from './qrcode.service';
import { CreateQrcodeDto } from './dto/create-qrcode.dto';
import { AuthGuard } from '@nestjs/passport';
import { GetAllResponseDto } from 'src/common/dto/get-all.dto';
import { QrCode } from './entity/qrcode.entity';
import { UpdateQrcodeDto } from './dto/update-qrcode.dto';

@ApiBearerAuth()
@ApiTags('QRCode')
@Controller('qrcode')
export class QrcodeController {
  constructor(private readonly qrcodeService: QrcodeService) {}

  @UseGuards(AuthGuard())
  @Post()
  @ApiOperation({ summary: 'Cria um novo QR code' })
  async createQrCode(@Body() createQrcodeDto: CreateQrcodeDto) {
    return await this.qrcodeService.createQrCode(createQrcodeDto);
  }

  @UseGuards(AuthGuard())
  @Put('/:qrCodeId')
  @ApiOperation({
    summary: 'Atualiza um QR code pelo ID',
  })
  async updateUser(
    @Param('qrCodeId') qrCodeId: string,
    @Body() updateQrcodeDto: UpdateQrcodeDto,
  ) {
    return await this.qrcodeService.updateQrCode(qrCodeId, updateQrcodeDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Busca todos os qr codes',
  })
  @ApiQuery({ name: 'take', required: false })
  @ApiQuery({ name: 'skip', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'sort', required: false })
  @ApiQuery({ name: 'order', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiOkResponse({ type: GetAllResponseDto<QrCode> })
  async getAllQrCodes(
    @Query('take') take = 10,
    @Query('skip') skip = 0,
    @Query('search') search: string,
    @Query('sort') sort: string = 'name',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
    @Query('userId') userId?: string,
  ) {
    return await this.qrcodeService.getAllQrCodes(
      take,
      skip,
      search,
      sort,
      order,
      userId,
    );
  }
}

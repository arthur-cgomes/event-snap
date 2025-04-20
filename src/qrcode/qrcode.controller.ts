import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QrcodeService } from './qrcode.service';
import { CreateQrcodeDto } from './dto/create-qrcode.dto';
import { AuthGuard } from '@nestjs/passport';

//@ApiBearerAuth()
@ApiTags('QRCode')
@Controller('qrcode')
export class QrcodeController {
  constructor(private readonly qrcodeService: QrcodeService) {}

  //@UseGuards(AuthGuard())
  @Post()
  @ApiOperation({ summary: 'Cria um novo QR code' })
  async createQrCode(@Body() createQrcodeDto: CreateQrcodeDto) {
    return await this.qrcodeService.createQrCode(createQrcodeDto);
  }
}

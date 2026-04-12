import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { BannerService } from './banner.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserType } from '../../common/enum/user-type.enum';

@ApiBearerAuth()
@ApiTags('Banner')
@Controller('banner')
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  @Get('active')
  @ApiOperation({ summary: 'Lista banners ativos (público)' })
  async findActive() {
    return await this.bannerService.findActive();
  }

  @Get()
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'Lista todos os banners (admin)' })
  async findAll() {
    return await this.bannerService.findAll();
  }

  @Get(':id')
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'Busca banner por ID (admin)' })
  async findById(@Param('id') id: string) {
    return await this.bannerService.findById(id);
  }

  @Post()
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'Cria um novo banner (admin)' })
  async create(@Body() dto: CreateBannerDto) {
    return await this.bannerService.create(dto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(UserType.ADMIN)
  @ApiOperation({ summary: 'Atualiza um banner (admin)' })
  async update(@Param('id') id: string, @Body() dto: UpdateBannerDto) {
    return await this.bannerService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(UserType.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove um banner (admin)' })
  async remove(@Param('id') id: string) {
    await this.bannerService.remove(id);
  }
}

import { Module } from '@nestjs/common';
import { BannerService } from './banner.service';
import { BannerController } from './banner.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Banner } from './entity/banner.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Banner])],
  providers: [BannerService],
  controllers: [BannerController],
  exports: [BannerService],
})
export class BannerModule {}

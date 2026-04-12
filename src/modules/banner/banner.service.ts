import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  LessThanOrEqual,
  MoreThanOrEqual,
  IsNull,
  Or,
  Repository,
} from 'typeorm';
import { Banner } from './entity/banner.entity';

@Injectable()
export class BannerService {
  constructor(
    @InjectRepository(Banner)
    private readonly bannerRepository: Repository<Banner>,
  ) {}

  async create(data: Partial<Banner>): Promise<Banner> {
    const banner = this.bannerRepository.create(data);
    return await this.bannerRepository.save(banner);
  }

  async findAll(): Promise<Banner[]> {
    return await this.bannerRepository.find({
      where: { deletedAt: IsNull() },
      order: { displayOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  async findActive(): Promise<Banner[]> {
    const now = new Date();
    return await this.bannerRepository.find({
      where: {
        active: true,
        deletedAt: IsNull(),
        startsAt: Or(IsNull(), LessThanOrEqual(now)),
        endsAt: Or(IsNull(), MoreThanOrEqual(now)),
      },
      order: { displayOrder: 'ASC' },
    });
  }

  async findById(id: string): Promise<Banner> {
    const banner = await this.bannerRepository.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!banner) throw new NotFoundException('Banner not found');
    return banner;
  }

  async update(id: string, data: Partial<Banner>): Promise<Banner> {
    await this.findById(id);
    await this.bannerRepository.update(id, data);
    return await this.findById(id);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.bannerRepository.update(id, {
      active: false,
      deletedAt: new Date(),
    });
  }
}

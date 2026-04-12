import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MockRepository,
  repositoryMockFactory,
} from '../../../common/utils/test.util';
import { Banner } from '../entity/banner.entity';
import { BannerService } from '../banner.service';

describe('BannerService', () => {
  let service: BannerService;
  let bannerRepository: MockRepository<Repository<Banner>>;

  const mockBanner = {
    id: '1',
    title: 'Test Banner',
    description: 'Test Description',
    imageUrl: 'https://example.com/image.jpg',
    linkUrl: 'https://example.com',
    active: true,
    displayOrder: 1,
    startsAt: null,
    endsAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any as Banner;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BannerService,
        {
          provide: getRepositoryToken(Banner),
          useValue: repositoryMockFactory<Banner>(),
        },
      ],
    }).compile();

    service = module.get<BannerService>(BannerService);
    bannerRepository = module.get(getRepositoryToken(Banner));
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('Should create a banner', async () => {
      const createBannerData = {
        title: 'Test Banner',
        description: 'Test Description',
        imageUrl: 'https://example.com/image.jpg',
      };

      bannerRepository.create = jest.fn().mockReturnValue(mockBanner);
      bannerRepository.save = jest.fn().mockResolvedValue(mockBanner);

      const result = await service.create(createBannerData);

      expect(result).toEqual(mockBanner);
      expect(bannerRepository.create).toHaveBeenCalledWith(createBannerData);
      expect(bannerRepository.save).toHaveBeenCalledWith(mockBanner);
    });
  });

  describe('findAll', () => {
    it('Should find all non-deleted banners', async () => {
      bannerRepository.find = jest.fn().mockResolvedValue([mockBanner]);

      const result = await service.findAll();

      expect(result).toEqual([mockBanner]);
      expect(bannerRepository.find).toHaveBeenCalled();
    });

    it('Should return empty array when no banners found', async () => {
      bannerRepository.find = jest.fn().mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findActive', () => {
    it('Should find active banners within date range', async () => {
      bannerRepository.find = jest.fn().mockResolvedValue([mockBanner]);

      const result = await service.findActive();

      expect(result).toEqual([mockBanner]);
      expect(bannerRepository.find).toHaveBeenCalled();
    });

    it('Should return empty array when no active banners', async () => {
      bannerRepository.find = jest.fn().mockResolvedValue([]);

      const result = await service.findActive();

      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('Should find banner by id', async () => {
      bannerRepository.findOne = jest.fn().mockResolvedValue(mockBanner);

      const result = await service.findById('1');

      expect(result).toEqual(mockBanner);
      expect(bannerRepository.findOne).toHaveBeenCalled();
    });

    it('Should throw NotFoundException when banner not found', async () => {
      bannerRepository.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('Should update a banner', async () => {
      const updateData = { title: 'Updated Banner' };
      const updatedBanner = { ...mockBanner, ...updateData };

      bannerRepository.findOne = jest
        .fn()
        .mockResolvedValueOnce(mockBanner)
        .mockResolvedValueOnce(updatedBanner);
      bannerRepository.update = jest.fn().mockResolvedValue(undefined);

      const result = await service.update('1', updateData);

      expect(result).toEqual(updatedBanner);
      expect(bannerRepository.update).toHaveBeenCalledWith('1', updateData);
    });

    it('Should throw NotFoundException when updating non-existent banner', async () => {
      bannerRepository.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.update('nonexistent', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('Should soft delete a banner', async () => {
      bannerRepository.findOne = jest.fn().mockResolvedValue(mockBanner);
      bannerRepository.update = jest.fn().mockResolvedValue(undefined);

      await service.remove('1');

      expect(bannerRepository.update).toHaveBeenCalledWith('1', {
        active: false,
        deletedAt: expect.any(Date),
      });
    });

    it('Should throw NotFoundException when deleting non-existent banner', async () => {
      bannerRepository.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

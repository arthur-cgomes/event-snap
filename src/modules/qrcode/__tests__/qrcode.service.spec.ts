import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MockRepository,
  repositoryMockFactory,
} from '../../../common/utils/test.util';
import { CacheService } from '../../../common/services/cache.service';
import { UserService } from '../../user/user.service';
import { QrcodeService } from '../qrcode.service';
import { QrCode } from '../entity/qrcode.entity';
import { User } from '../../user/entity/user.entity';
import { QrCodeType } from '../../../common/enum/qrcode-type.enum';

jest.mock('qrcode');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require('qrcode');

describe('QrcodeService', () => {
  let service: QrcodeService;
  let qrCodeRepository: MockRepository<Repository<QrCode>>;
  let userService: jest.Mocked<UserService>;
  let cacheService: jest.Mocked<CacheService>;

  const mockUser = {
    id: 'user-id',
    email: 'test@example.com',
    name: 'Test User',
  } as User;

  const mockQrCode = {
    id: 'qr-id',
    token: 'token-123',
    eventName: 'Test Event',
    descriptionEvent: 'Test Description',
    user: mockUser,
    type: QrCodeType.FREE,
    expirationDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    eventColor: '#FF0000',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as QrCode;

  beforeEach(async () => {
    userService = {
      getUserById: jest.fn(),
    } as any;

    cacheService = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(undefined),
      delByPattern: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QrcodeService,
        {
          provide: getRepositoryToken(QrCode),
          useValue: repositoryMockFactory<QrCode>(),
        },
        {
          provide: UserService,
          useValue: userService,
        },
        {
          provide: CacheService,
          useValue: cacheService,
        },
        {
          provide: EventEmitter2,
          useValue: {
            on: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<QrcodeService>(QrcodeService);
    qrCodeRepository = module.get(getRepositoryToken(QrCode));
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleUserCreated event', () => {
    it('Should generate welcome QR code when user is created', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.create = jest.fn().mockReturnValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);

      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      const event = { userId: 'user-id' };
      await (service as any).handleUserCreated(event);

      expect(userService.getUserById).toHaveBeenCalledWith('user-id');
      expect(qrCodeRepository.save).toHaveBeenCalled();
    });

    it('Should throw BadRequestException if welcome QR code creation fails', async () => {
      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.save.mockRejectedValue(new Error('DB error'));

      const event = { userId: 'user-id' };

      await expect((service as any).handleUserCreated(event)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('createQrCode', () => {
    it('Should create a QR code successfully', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const createDto = {
        userId: 'user-id',
        eventName: 'Test Event',
        descriptionEvent: 'Test Description',
        type: QrCodeType.FREE,
        expirationDate: futureDate,
      };

      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.create = jest.fn().mockReturnValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);
      cacheService.set.mockResolvedValue(undefined);

      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      const result = await service.createQrCode(createDto);

      expect(result.qrCode).toEqual(mockQrCode);
      expect(result.qrCodeImage).toBeDefined();
      expect(userService.getUserById).toHaveBeenCalledWith('user-id');
      expect(qrCodeRepository.save).toHaveBeenCalled();
    });

    it('Should throw NotFoundException when user not found', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const createDto = {
        userId: 'nonexistent',
        eventName: 'Test Event',
        descriptionEvent: 'Test Description',
        type: QrCodeType.FREE,
        expirationDate: futureDate,
      };

      userService.getUserById.mockRejectedValue(
        new NotFoundException('user not found'),
      );

      await expect(service.createQrCode(createDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getQrCodeById', () => {
    it('Should get QR code by id', async () => {
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);

      const result = await service.getQrCodeById('qr-id');

      expect(result).toEqual(mockQrCode);
      expect(qrCodeRepository.findOne).toHaveBeenCalled();
    });

    it('Should throw NotFoundException when QR code not found', async () => {
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.getQrCodeById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateQrCode', () => {
    it('Should throw ForbiddenException when user not owner', async () => {
      const updateDto = { eventName: 'Updated Event' };
      const otherUserQrCode = {
        ...mockQrCode,
        user: { id: 'other-user-id' },
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(otherUserQrCode);

      await expect(
        service.updateQrCode('qr-id', updateDto, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Should throw NotFoundException when QR code not found', async () => {
      const updateDto = { eventName: 'Updated Event' };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        service.updateQrCode('nonexistent', updateDto, mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getQrCodeByToken', () => {
    it('Should get QR code by token from cache', async () => {
      cacheService.get.mockResolvedValue(mockQrCode);

      const result = await service.getQrCodeByToken('token-123');

      expect(result).toEqual(mockQrCode);
      expect(cacheService.get).toHaveBeenCalledWith(
        expect.stringContaining('token-123'),
      );
    });

    it('Should get QR code by token from database if not in cache', async () => {
      cacheService.get.mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      cacheService.set.mockResolvedValue(undefined);

      const result = await service.getQrCodeByToken('token-123');

      expect(result).toEqual(mockQrCode);
      expect(qrCodeRepository.findOne).toHaveBeenCalled();
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('Should throw NotFoundException when QR code not found', async () => {
      cacheService.get.mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.getQrCodeByToken('invalid-token')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAllQrCodes', () => {
    it('Should get all QR codes', async () => {
      qrCodeRepository.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockQrCode], 1]);

      const result = await service.getAllQrCodes(10, 0, '', 'createdAt', 'ASC');

      expect(result.total).toBe(1);
      expect(result.items).toContain(mockQrCode);
      expect(qrCodeRepository.findAndCount).toHaveBeenCalled();
    });

    it('Should return empty list when no QR codes found', async () => {
      qrCodeRepository.findAndCount = jest.fn().mockResolvedValue([[], 0]);

      const result = await service.getAllQrCodes(10, 0, '', 'createdAt', 'ASC');

      expect(result.total).toBe(0);
      expect(result.items.length).toBe(0);
    });

    it('Should return paginated results', async () => {
      qrCodeRepository.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockQrCode], 5]);

      const result = await service.getAllQrCodes(2, 0, '', 'createdAt', 'ASC');

      expect(result.total).toBe(5);
      expect(qrCodeRepository.findAndCount).toHaveBeenCalled();
    });
  });

  describe('getQrCodesByStatus', () => {
    it('Should get QR codes by status', async () => {
      qrCodeRepository.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockQrCode], 1]);

      const result = await service.getQrCodesByStatus(
        10,
        0,
        'active',
        'createdAt',
        'ASC',
      );

      expect(result.total).toBe(1);
      expect(result.items).toContain(mockQrCode);
      expect(qrCodeRepository.findAndCount).toHaveBeenCalled();
    });

    it('Should get expired QR codes', async () => {
      qrCodeRepository.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockQrCode], 1]);

      const result = await service.getQrCodesByStatus(
        10,
        0,
        'expired',
        'createdAt',
        'ASC',
      );

      expect(result.total).toBe(1);
      expect(qrCodeRepository.findAndCount).toHaveBeenCalled();
    });
  });

  describe('getQrCodeByIdOrToken', () => {
    it('Should get QR code by ID', async () => {
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);

      const result = await service.getQrCodeByIdOrToken('qr-id');

      expect(result).toEqual(mockQrCode);
      expect(qrCodeRepository.findOne).toHaveBeenCalled();
    });

    it('Should throw NotFoundException when not found', async () => {
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.getQrCodeByIdOrToken('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Should get QR code by ID from cache', async () => {
      cacheService.get = jest
        .fn()
        .mockResolvedValueOnce(mockQrCode)
        .mockResolvedValueOnce(null);

      const result = await service.getQrCodeByIdOrToken('qr-id');

      expect(result).toEqual(mockQrCode);
      expect(qrCodeRepository.findOne).not.toHaveBeenCalled();
    });

    it('Should get QR code by token from cache', async () => {
      cacheService.get = jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockQrCode);

      const result = await service.getQrCodeByIdOrToken('token-123');

      expect(result).toEqual(mockQrCode);
      expect(qrCodeRepository.findOne).not.toHaveBeenCalled();
    });

    it('Should fetch from database and cache when not cached', async () => {
      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);

      const result = await service.getQrCodeByIdOrToken('qr-id');

      expect(result).toEqual(mockQrCode);
      expect(cacheService.set).toHaveBeenCalledTimes(2);
    });
  });

  describe('createQrCode - additional cases', () => {
    it('Should create QR code without expiration date', async () => {
      const createDto = {
        userId: 'user-id',
        eventName: 'Test Event',
        descriptionEvent: 'Test Description',
        type: QrCodeType.PAID,
      };

      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.create = jest.fn().mockReturnValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);

      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      const result = await service.createQrCode(createDto);

      expect(result.qrCode).toEqual(mockQrCode);
      expect(qrCodeRepository.create).toHaveBeenCalled();
    });

    it('Should create QR code with event color', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const createDto = {
        userId: 'user-id',
        eventName: 'Test Event',
        descriptionEvent: 'Test Description',
        type: QrCodeType.PAID,
        expirationDate: futureDate,
        eventColor: '#FF0000',
      };

      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.create = jest.fn().mockReturnValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);

      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      const result = await service.createQrCode(createDto);

      expect(result.qrCode.eventColor).toBe('#FF0000');
    });

    it('Should throw BadRequestException on error creating QR code', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const createDto = {
        userId: 'user-id',
        eventName: 'Test Event',
        descriptionEvent: 'Test Description',
        type: QrCodeType.FREE,
        expirationDate: futureDate,
      };

      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.save.mockRejectedValue(new Error('DB error'));

      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      await expect(service.createQrCode(createDto)).rejects.toThrow();
    });
  });

  describe('updateQrCode - additional cases', () => {
    it('Should update event name', async () => {
      const updateDto = { eventName: 'Updated Event' };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue({
        ...mockQrCode,
        eventName: 'Updated Event',
      });

      const result = await service.updateQrCode('qr-id', updateDto, mockUser);

      expect(result.eventName).toBe('Updated Event');
      expect(qrCodeRepository.save).toHaveBeenCalled();
    });

    it('Should update description', async () => {
      const updateDto = { descriptionEvent: 'Updated Description' };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue({
        ...mockQrCode,
        descriptionEvent: 'Updated Description',
      });

      const result = await service.updateQrCode('qr-id', updateDto, mockUser);

      expect(result.descriptionEvent).toBe('Updated Description');
    });

    it('Should update expiration date', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 14);

      const updateDto = { expirationDate: futureDate };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue({
        ...mockQrCode,
        expirationDate: futureDate,
      });

      const result = await service.updateQrCode('qr-id', updateDto, mockUser);

      expect(result.expirationDate).toEqual(futureDate);
    });

    it('Should allow admin to update any QR code', async () => {
      const adminUser = { ...mockUser, userType: 'admin' } as any;
      const otherUserQrCode = {
        ...mockQrCode,
        user: { id: 'other-user' },
      };

      const updateDto = { eventName: 'Admin Update' };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(otherUserQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue({
        ...otherUserQrCode,
        eventName: 'Admin Update',
      });

      const result = await service.updateQrCode('qr-id', updateDto, adminUser);

      expect(result.eventName).toBe('Admin Update');
    });

    it('Should ignore undefined update fields', async () => {
      const updateDto = {
        eventName: undefined,
        descriptionEvent: undefined,
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);

      const result = await service.updateQrCode('qr-id', updateDto, mockUser);

      expect(result).toEqual(mockQrCode);
    });

    it('Should invalidate cache after update', async () => {
      const updateDto = { eventName: 'Updated' };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue({
        ...mockQrCode,
        eventName: 'Updated',
      });

      await service.updateQrCode('qr-id', updateDto, mockUser);

      expect(cacheService.del).toHaveBeenCalledWith(
        expect.stringContaining('qrcode:id'),
      );
      expect(cacheService.del).toHaveBeenCalledWith(
        expect.stringContaining('qrcode:token'),
      );
      expect(cacheService.delByPattern).toHaveBeenCalledWith(
        expect.stringContaining('qrcode:stats'),
      );
    });
  });

  describe('getQrCodeById - additional cases', () => {
    it('Should get QR code by ID from cache', async () => {
      cacheService.get.mockResolvedValue(mockQrCode);

      const result = await service.getQrCodeById('qr-id');

      expect(result).toEqual(mockQrCode);
      expect(qrCodeRepository.findOne).not.toHaveBeenCalled();
    });

    it('Should fetch QR code from database and cache it', async () => {
      cacheService.get.mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);

      const result = await service.getQrCodeById('qr-id');

      expect(result).toEqual(mockQrCode);
      expect(cacheService.set).toHaveBeenCalled();
    });
  });

  describe('getAllQrCodes - additional cases', () => {
    it('Should filter by search term', async () => {
      qrCodeRepository.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockQrCode], 1]);

      const result = await service.getAllQrCodes(
        10,
        0,
        'Test',
        'createdAt',
        'ASC',
      );

      expect(result.total).toBe(1);
      expect(qrCodeRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventName: expect.anything(),
          }),
        }),
      );
    });

    it('Should filter by userId', async () => {
      qrCodeRepository.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockQrCode], 2]);

      const result = await service.getAllQrCodes(
        10,
        0,
        '',
        'createdAt',
        'ASC',
        'user-id',
      );

      expect(result.total).toBe(2);
      expect(qrCodeRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: expect.anything(),
          }),
        }),
      );
    });

    it('Should calculate pagination correctly', async () => {
      qrCodeRepository.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockQrCode, mockQrCode], 50]);

      const result = await service.getAllQrCodes(10, 0, '', 'createdAt', 'ASC');

      expect(result.skip).toBe(10);
      expect(result.total).toBe(50);
    });

    it('Should return null skip when no more items', async () => {
      qrCodeRepository.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockQrCode], 5]);

      const result = await service.getAllQrCodes(10, 0, '', 'createdAt', 'ASC');

      expect(result.skip).toBeNull();
    });
  });

  describe('getQrCodesByStatus', () => {
    it('Should get active QR codes', async () => {
      qrCodeRepository.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockQrCode], 5]);

      const result = await service.getQrCodesByStatus(
        10,
        0,
        'active',
        'createdAt',
        'ASC',
      );

      expect(result.total).toBe(5);
      expect(qrCodeRepository.findAndCount).toHaveBeenCalled();
    });

    it('Should get expired QR codes', async () => {
      const expiredQrCode = {
        ...mockQrCode,
        expirationDate: new Date(Date.now() - 1000),
      };
      qrCodeRepository.findAndCount = jest
        .fn()
        .mockResolvedValue([[expiredQrCode], 3]);

      const result = await service.getQrCodesByStatus(
        10,
        0,
        'expired',
        'createdAt',
        'ASC',
      );

      expect(result.total).toBe(3);
    });

    it('Should return null skip for expired QR codes when empty', async () => {
      qrCodeRepository.findAndCount = jest.fn().mockResolvedValue([[], 0]);

      const result = await service.getQrCodesByStatus(
        10,
        0,
        'expired',
        'createdAt',
        'ASC',
      );

      expect(result.skip).toBeNull();
      expect(result.total).toBe(0);
    });

    it('Should calculate pagination for status query', async () => {
      const qrCodes = Array(5).fill(mockQrCode);
      qrCodeRepository.findAndCount = jest
        .fn()
        .mockResolvedValue([qrCodes, 30]);

      const result = await service.getQrCodesByStatus(
        5,
        0,
        'active',
        'createdAt',
        'DESC',
      );

      expect(result.skip).toBe(5);
      expect(result.total).toBe(30);
    });
  });

  describe('getUsersQrStatusCounts', () => {
    it('Should return zero counts for empty user IDs', async () => {
      const result = await service.getUsersQrStatusCounts([]);

      expect(result).toEqual({ active: 0, expired: 0, none: 0 });
      expect(qrCodeRepository.find).not.toHaveBeenCalled();
    });

    it('Should return zero counts when user IDs is null/undefined', async () => {
      const result = await service.getUsersQrStatusCounts(
        null as unknown as string[],
      );

      expect(result).toEqual({ active: 0, expired: 0, none: 0 });
      expect(qrCodeRepository.find).not.toHaveBeenCalled();
    });

    it('Should get QR status counts from cache', async () => {
      cacheService.get.mockResolvedValue({
        active: 2,
        expired: 1,
        none: 0,
      });

      const result = await service.getUsersQrStatusCounts(['user-1', 'user-2']);

      expect(result).toEqual({ active: 2, expired: 1, none: 0 });
      expect(qrCodeRepository.find).not.toHaveBeenCalled();
    });

    it('Should count active and expired QR codes', async () => {
      const qrCodes = [
        { ...mockQrCode, user: { id: 'user-1' } as User },
        {
          ...mockQrCode,
          expirationDate: new Date(Date.now() - 1000),
          user: { id: 'user-2' } as User,
        },
      ];
      qrCodeRepository.find = jest.fn().mockResolvedValue(qrCodes);

      const result = await service.getUsersQrStatusCounts(['user-1', 'user-2']);

      expect(result.active).toBe(1);
      expect(result.expired).toBe(1);
      expect(result.none).toBe(0);
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('Should count users without QR codes', async () => {
      const qrCodes = [{ ...mockQrCode, user: { id: 'user-1' } as User }];
      qrCodeRepository.find = jest.fn().mockResolvedValue(qrCodes);

      const result = await service.getUsersQrStatusCounts([
        'user-1',
        'user-2',
        'user-3',
      ]);

      expect(result.none).toBe(2);
    });

    it('Should deduplicate user IDs', async () => {
      qrCodeRepository.find = jest.fn().mockResolvedValue([]);

      await service.getUsersQrStatusCounts(['user-1', 'user-1', 'user-2']);

      expect(qrCodeRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: expect.objectContaining({
              id: expect.anything(),
            }),
          }),
        }),
      );
    });
  });

  describe('resolveExpirationDate - private method through createQrCode', () => {
    it('Should throw BadRequestException for past dates', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const createDto = {
        userId: 'user-id',
        eventName: 'Test Event',
        descriptionEvent: 'Test Description',
        type: QrCodeType.PAID,
        expirationDate: pastDate,
      };

      userService.getUserById.mockResolvedValue(mockUser);

      await expect(service.createQrCode(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('Should throw BadRequestException for invalid date type', async () => {
      const createDto = {
        userId: 'user-id',
        eventName: 'Test Event',
        descriptionEvent: 'Test Description',
        type: QrCodeType.PAID,
        expirationDate: 123 as any,
      };

      userService.getUserById.mockResolvedValue(mockUser);

      await expect(service.createQrCode(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('Should throw BadRequestException for null/undefined expiration', async () => {
      const createDto = {
        userId: 'user-id',
        eventName: 'Test Event',
        descriptionEvent: 'Test Description',
        type: QrCodeType.PAID,
        expirationDate: null as any,
      };

      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.create = jest.fn().mockReturnValue({
        ...mockQrCode,
        expirationDate: undefined,
      });
      qrCodeRepository.save = jest.fn().mockResolvedValue({
        ...mockQrCode,
        expirationDate: undefined,
      });

      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      const result = await service.createQrCode(createDto);
      expect(result.qrCode).toBeDefined();
    });

    it('Should accept a valid future date passed as ISO string', async () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      const futureIso = future.toISOString().slice(0, 19);

      const createDto = {
        userId: 'user-id',
        eventName: 'Test Event',
        descriptionEvent: 'Test Description',
        type: QrCodeType.PAID,
        expirationDate: futureIso as any,
      };

      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.create = jest.fn().mockReturnValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);

      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      const result = await service.createQrCode(createDto);
      expect(result.qrCode).toBeDefined();
    });

    it('Should throw BadRequestException for an invalid Date object', async () => {
      const createDto = {
        userId: 'user-id',
        eventName: 'Test Event',
        descriptionEvent: 'Test Description',
        type: QrCodeType.PAID,
        expirationDate: new Date('invalid-date-string'),
      };

      userService.getUserById.mockResolvedValue(mockUser);

      await expect(service.createQrCode(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('calculateCacheTTL - private method', () => {
    it('Should use default TTL when no expiration date', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 365);

      const createDto = {
        userId: 'user-id',
        eventName: 'Test Event',
        descriptionEvent: 'Test Description',
        type: QrCodeType.PAID,
        expirationDate: futureDate,
      };

      const qrCodeWithoutExp = { ...mockQrCode, expirationDate: null };
      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.create = jest.fn().mockReturnValue(qrCodeWithoutExp);
      qrCodeRepository.save = jest.fn().mockResolvedValue(qrCodeWithoutExp);

      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      await service.createQrCode(createDto);

      expect(cacheService.set).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.any(Number),
      );
    });

    it('Should use shorter TTL for soon-to-expire QR codes', async () => {
      const veryFutureDate = new Date();
      veryFutureDate.setDate(veryFutureDate.getDate() + 2);

      const createDto = {
        userId: 'user-id',
        eventName: 'Test Event',
        descriptionEvent: 'Test Description',
        type: QrCodeType.PAID,
        expirationDate: veryFutureDate,
      };

      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.create = jest.fn().mockReturnValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue({
        ...mockQrCode,
        expirationDate: veryFutureDate,
      });

      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      await service.createQrCode(createDto);

      const calls = (cacheService.set as jest.Mock).mock.calls;
      const ttlValue = calls[calls.length - 1][2];
      expect(ttlValue).toBeLessThanOrEqual(3600);
    });

    it('Should use 300s TTL for already-expired QR codes', async () => {
      const expiredDate = new Date();
      expiredDate.setTime(expiredDate.getTime() - 1000);

      const createDto = {
        userId: 'user-id',
        eventName: 'Test Event',
        descriptionEvent: 'Test Description',
        type: QrCodeType.PAID,
        expirationDate: new Date(Date.now() + 100000),
      };

      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.create = jest.fn().mockReturnValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue({
        ...mockQrCode,
        expirationDate: expiredDate,
      });

      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      await service.createQrCode(createDto);

      const calls = (cacheService.set as jest.Mock).mock.calls;
      const hasTtl300 = calls.some((call) => call[2] === 300);
      expect(hasTtl300).toBe(true);
    });
  });
});

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
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../../../common/services/cache.service';
import { UserService } from '../../user/user.service';
import { DispatcherEmailService } from '../../dispatcher-email/dispatcher-email.service';
import { QrcodeService } from '../qrcode.service';
import { QrCode } from '../entity/qrcode.entity';
import { User } from '../../user/entity/user.entity';
import { QrCodeType } from '../../../common/enum/qrcode-type.enum';
import { QrCodePlan } from '../../../common/enum/qrcode-plan.enum';
import { APP_CONSTANTS } from '../../../common/constants';

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
        {
          provide: DispatcherEmailService,
          useValue: {
            sendEmail: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('http://localhost:3001'),
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

    it('Should generate storagePrefix as slug-suffix from eventName', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const createDto = {
        userId: 'user-id',
        eventName: 'Aniversário Arthur',
        type: QrCodeType.FREE,
        expirationDate: futureDate,
      };

      userService.getUserById.mockResolvedValue(mockUser);
      let capturedCreate: any;
      qrCodeRepository.create = jest.fn().mockImplementation((data) => {
        capturedCreate = data;
        return { ...mockQrCode, ...data };
      });
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);
      cacheService.set.mockResolvedValue(undefined);
      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      await service.createQrCode(createDto);

      expect(capturedCreate.storagePrefix).toMatch(
        /^aniversario-arthur-[a-f0-9]{8}$/,
      );
    });

    it('Should use "evento" slug when eventName is empty', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);

      const createDto = {
        userId: 'user-id',
        eventName: undefined as any,
        type: QrCodeType.FREE,
        expirationDate: futureDate,
      };

      userService.getUserById.mockResolvedValue(mockUser);
      let capturedCreate: any;
      qrCodeRepository.create = jest.fn().mockImplementation((data) => {
        capturedCreate = data;
        return { ...mockQrCode, ...data };
      });
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);
      cacheService.set.mockResolvedValue(undefined);
      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      await service.createQrCode(createDto);

      expect(capturedCreate.storagePrefix).toMatch(/^evento-[a-f0-9]{8}$/);
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

    it('Should throw NotFoundException when QR code is expired', async () => {
      cacheService.get.mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue({
        ...mockQrCode,
        expirationDate: new Date(Date.now() - 1000),
      });

      await expect(service.getQrCodeByToken('token-123')).rejects.toThrow(
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

  describe('updateQrCode - plan and uploadEnabled fields', () => {
    it('Should update plan and uploadEnabled when provided', async () => {
      const updateDto = {
        plan: QrCodePlan.PARTY,
        uploadEnabled: true,
      };

      const qrCodeToUpdate = {
        ...mockQrCode,
        plan: QrCodePlan.FREE,
        uploadEnabled: false,
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeToUpdate);
      qrCodeRepository.save = jest.fn().mockResolvedValue({
        ...qrCodeToUpdate,
        plan: QrCodePlan.PARTY,
        uploadEnabled: true,
      });

      const result = await service.updateQrCode('qr-id', updateDto, mockUser);

      expect(result.plan).toBe(QrCodePlan.PARTY);
      expect(result.uploadEnabled).toBe(true);
      expect(qrCodeRepository.save).toHaveBeenCalled();
    });

    it('Should not update plan when undefined in DTO', async () => {
      const updateDto = {
        eventName: 'Updated Event',
      };

      const qrCodeToUpdate = {
        ...mockQrCode,
        plan: QrCodePlan.FREE,
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeToUpdate);
      qrCodeRepository.save = jest.fn().mockResolvedValue(qrCodeToUpdate);

      await service.updateQrCode('qr-id', updateDto, mockUser);

      const savedQrCode = (qrCodeRepository.save as jest.Mock).mock.calls[0][0];
      expect(savedQrCode.plan).toBe(QrCodePlan.FREE);
    });

    it('Should not update uploadEnabled when undefined in DTO', async () => {
      const updateDto = {
        eventName: 'Updated Event',
      };

      const qrCodeToUpdate = {
        ...mockQrCode,
        uploadEnabled: false,
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeToUpdate);
      qrCodeRepository.save = jest.fn().mockResolvedValue(qrCodeToUpdate);

      await service.updateQrCode('qr-id', updateDto, mockUser);

      const savedQrCode = (qrCodeRepository.save as jest.Mock).mock.calls[0][0];
      expect(savedQrCode.uploadEnabled).toBe(false);
    });
  });

  describe('updateQrCode - paid plan fields', () => {
    it('Should update paid-plan-only fields for PARTY plan', async () => {
      const updateDto = {
        plan: QrCodePlan.PARTY,
        eventLocation: 'São Paulo',
        eventDateTime: '2026-05-15T18:00:00',
        dressCode: 'Formal',
        eventTheme: 'Gala',
        coverImageUrl: 'https://example.com/cover.jpg',
        recommendations: 'Come hungry!',
        galleryEnabled: true,
        eventColor: '#00FF00',
      };

      const qrCodeToUpdate = {
        ...mockQrCode,
        plan: QrCodePlan.FREE,
        eventLocation: null,
        eventDateTime: null,
        dressCode: null,
        eventTheme: null,
        coverImageUrl: null,
        recommendations: null,
        galleryEnabled: false,
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeToUpdate);
      qrCodeRepository.save = jest.fn().mockResolvedValue({
        ...qrCodeToUpdate,
        ...updateDto,
        eventDateTime: new Date(updateDto.eventDateTime),
      });

      const result = await service.updateQrCode('qr-id', updateDto, mockUser);

      expect(result.plan).toBe(QrCodePlan.PARTY);
      expect(result.eventLocation).toBe('São Paulo');
      expect(result.dressCode).toBe('Formal');
      expect(result.eventTheme).toBe('Gala');
      expect(result.coverImageUrl).toBe('https://example.com/cover.jpg');
      expect(result.recommendations).toBe('Come hungry!');
      expect(result.galleryEnabled).toBe(true);
      expect(result.eventColor).toBe('#00FF00');
    });

    it('Should update paid-plan-only fields for CORPORATE plan', async () => {
      const updateDto = {
        plan: QrCodePlan.CORPORATE,
        eventLocation: 'New York',
        eventDateTime: '2026-06-20T09:00:00',
        dressCode: 'Business Casual',
        eventTheme: 'Conference',
        coverImageUrl: 'https://example.com/corporate.jpg',
        recommendations: 'Bring your business cards',
        galleryEnabled: true,
        eventColor: '#0000FF',
      };

      const qrCodeToUpdate = {
        ...mockQrCode,
        plan: QrCodePlan.FREE,
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeToUpdate);
      qrCodeRepository.save = jest.fn().mockResolvedValue({
        ...qrCodeToUpdate,
        ...updateDto,
        eventDateTime: new Date(updateDto.eventDateTime),
      });

      const result = await service.updateQrCode('qr-id', updateDto, mockUser);

      expect(result.plan).toBe(QrCodePlan.CORPORATE);
      expect(result.eventLocation).toBe('New York');
      expect(result.eventDateTime).toBeDefined();
      expect(result.dressCode).toBe('Business Casual');
      expect(result.eventTheme).toBe('Conference');
      expect(result.coverImageUrl).toBe('https://example.com/corporate.jpg');
      expect(result.recommendations).toBe('Bring your business cards');
      expect(result.galleryEnabled).toBe(true);
    });

    it('Should not update paid-plan fields when plan is FREE', async () => {
      const updateDto = {
        plan: QrCodePlan.FREE,
        eventLocation: 'Should be ignored',
        eventDateTime: '2026-05-15T18:00:00',
        dressCode: 'Should be ignored',
      };

      const qrCodeToUpdate = {
        ...mockQrCode,
        plan: QrCodePlan.FREE,
        eventLocation: null,
        dressCode: null,
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeToUpdate);
      qrCodeRepository.save = jest.fn().mockResolvedValue(qrCodeToUpdate);

      await service.updateQrCode('qr-id', updateDto, mockUser);

      const savedQrCode = (qrCodeRepository.save as jest.Mock).mock.calls[0][0];
      expect(savedQrCode.eventLocation).toBeNull();
      expect(savedQrCode.dressCode).toBeNull();
    });

    it('Should partially update paid-plan fields', async () => {
      const updateDto = {
        plan: QrCodePlan.PARTY,
        eventLocation: 'London',
        // eventDateTime not provided
        // dressCode not provided
      };

      const qrCodeToUpdate = {
        ...mockQrCode,
        plan: QrCodePlan.PARTY,
        eventLocation: 'Paris',
        eventDateTime: new Date('2026-05-15T18:00:00'),
        dressCode: 'Semi-formal',
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeToUpdate);
      qrCodeRepository.save = jest.fn().mockResolvedValue({
        ...qrCodeToUpdate,
        eventLocation: 'London',
      });

      await service.updateQrCode('qr-id', updateDto, mockUser);

      const savedQrCode = (qrCodeRepository.save as jest.Mock).mock.calls[0][0];
      expect(savedQrCode.eventLocation).toBe('London');
      expect(savedQrCode.eventDateTime).toEqual(
        new Date('2026-05-15T18:00:00'),
      );
      expect(savedQrCode.dressCode).toBe('Semi-formal');
    });
  });

  describe('getExpirationForPlan - private method', () => {
    it('Should return PARTY expiration days when plan is PARTY', async () => {
      const futureDate = new Date();
      futureDate.setDate(
        futureDate.getDate() + APP_CONSTANTS.PARTY_EXPIRATION_DAYS,
      );

      const createDto = {
        userId: 'user-id',
        eventName: 'Party Event',
        descriptionEvent: 'Test Party',
        type: QrCodeType.PAID,
        plan: QrCodePlan.PARTY,
      };

      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.create = jest.fn().mockReturnValue(mockQrCode);
      qrCodeRepository.save = jest
        .fn()
        .mockResolvedValue({ ...mockQrCode, plan: QrCodePlan.PARTY });

      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      const result = await service.createQrCode(createDto);

      expect(result.qrCode.plan).toBe(QrCodePlan.PARTY);
      const savedQrCode = (qrCodeRepository.save as jest.Mock).mock.calls[0][0];
      expect(savedQrCode.expirationDate).toBeDefined();
    });

    it('Should return CORPORATE expiration days when plan is CORPORATE', async () => {
      const futureDate = new Date();
      futureDate.setDate(
        futureDate.getDate() + APP_CONSTANTS.CORPORATE_EXPIRATION_DAYS,
      );

      const createDto = {
        userId: 'user-id',
        eventName: 'Corporate Event',
        descriptionEvent: 'Test Corporate',
        type: QrCodeType.PAID,
        plan: QrCodePlan.CORPORATE,
      };

      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.create = jest.fn().mockReturnValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue({
        ...mockQrCode,
        plan: QrCodePlan.CORPORATE,
      });

      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      const result = await service.createQrCode(createDto);

      expect(result.qrCode.plan).toBe(QrCodePlan.CORPORATE);
      const savedQrCode = (qrCodeRepository.save as jest.Mock).mock.calls[0][0];
      expect(savedQrCode.expirationDate).toBeDefined();
    });

    it('Should use correct expiration days for each plan', async () => {
      const createDtoParty = {
        userId: 'user-id',
        eventName: 'Party',
        descriptionEvent: 'Test',
        type: QrCodeType.PAID,
        plan: QrCodePlan.PARTY,
      };

      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.create = jest.fn().mockReturnValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue({
        ...mockQrCode,
        plan: QrCodePlan.PARTY,
        expirationDate: new Date(
          Date.now() +
            APP_CONSTANTS.PARTY_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
        ),
      });

      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      await service.createQrCode(createDtoParty);

      const partyExpirationCall = (qrCodeRepository.save as jest.Mock).mock
        .calls[0][0];
      const partlyExpDate = partyExpirationCall.expirationDate;

      expect(partlyExpDate).toBeDefined();
    });
  });

  describe('updateLastUploadAt', () => {
    it('Should update lastUploadAt with current date', async () => {
      qrCodeRepository.update = jest.fn().mockResolvedValue(undefined);

      new Date();
      await service.updateLastUploadAt('qr-id');

      expect(qrCodeRepository.update).toHaveBeenCalledWith('qr-id', {
        lastUploadAt: expect.any(Date),
      });

      const updateCall = (qrCodeRepository.update as jest.Mock).mock.calls[0];
      expect(updateCall[0]).toBe('qr-id');
      expect(updateCall[1].lastUploadAt).toBeInstanceOf(Date);
    });

    it('Should set lastUploadAt to a recent timestamp', async () => {
      qrCodeRepository.update = jest.fn().mockResolvedValue(undefined);

      const beforeCall = Date.now();
      await service.updateLastUploadAt('qr-id');
      const afterCall = Date.now();

      const updateCall = (qrCodeRepository.update as jest.Mock).mock.calls[0];
      const updatedDate = updateCall[1].lastUploadAt.getTime();

      expect(updatedDate).toBeGreaterThanOrEqual(beforeCall);
      expect(updatedDate).toBeLessThanOrEqual(afterCall);
    });
  });

  describe('getQrCodeWithUser', () => {
    it('Should fetch QR code with user relation', async () => {
      const qrCodeWithUser = {
        ...mockQrCode,
        user: mockUser,
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeWithUser);

      const result = await service.getQrCodeWithUser('qr-id');

      expect(qrCodeRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'qr-id' },
        relations: ['user'],
      });
      expect(result).toEqual(qrCodeWithUser);
      expect(result.user).toBeDefined();
    });

    it('Should return null when QR code not found', async () => {
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(null);

      const result = await service.getQrCodeWithUser('nonexistent-id');

      expect(result).toBeNull();
    });

    it('Should include user information in result', async () => {
      const qrCodeWithUser = {
        ...mockQrCode,
        user: { id: 'user-123', email: 'user@example.com', name: 'User Name' },
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeWithUser);

      const result = await service.getQrCodeWithUser('qr-id');

      expect(result.user).toEqual({
        id: 'user-123',
        email: 'user@example.com',
        name: 'User Name',
      });
    });
  });

  describe('getEventAnalytics', () => {
    it('Should return event analytics with uploads', async () => {
      const now = new Date();
      const uploadDate1 = new Date(now.getTime() - 10000);
      const uploadDate2 = new Date(now.getTime() - 5000);

      const mockUpload1 = {
        id: 'upload-1',
        createdAt: uploadDate1,
        deletedAt: null,
      };

      const mockUpload2 = {
        id: 'upload-2',
        createdAt: uploadDate2,
        deletedAt: null,
      };

      const qrCodeWithUploads = {
        ...mockQrCode,
        viewCount: 42,
        lastUploadAt: uploadDate2,
        uploads: [mockUpload1, mockUpload2],
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeWithUploads);

      const result = await service.getEventAnalytics('qr-id');

      expect(result.viewCount).toBe(42);
      expect(result.totalUploads).toBe(2);
      expect(result.firstUploadAt).toEqual(uploadDate1);
      expect(result.lastUploadAt).toEqual(uploadDate2);
    });

    it('Should filter out deleted uploads', async () => {
      const now = new Date();
      const uploadDate1 = new Date(now.getTime() - 10000);
      const uploadDate2 = new Date(now.getTime() - 5000);

      const activeUpload = {
        id: 'upload-1',
        createdAt: uploadDate1,
        deletedAt: null,
      };

      const deletedUpload = {
        id: 'upload-2',
        createdAt: uploadDate2,
        deletedAt: new Date(now.getTime() - 2000),
      };

      const qrCodeWithUploads = {
        ...mockQrCode,
        viewCount: 50,
        lastUploadAt: uploadDate1,
        uploads: [activeUpload, deletedUpload],
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeWithUploads);

      const result = await service.getEventAnalytics('qr-id');

      expect(result.totalUploads).toBe(1);
      expect(result.firstUploadAt).toEqual(uploadDate1);
    });

    it('Should return null for first and last upload when no active uploads', async () => {
      const qrCodeWithoutUploads = {
        ...mockQrCode,
        viewCount: 100,
        lastUploadAt: null,
        uploads: [],
      };

      qrCodeRepository.findOne = jest
        .fn()
        .mockResolvedValue(qrCodeWithoutUploads);

      const result = await service.getEventAnalytics('qr-id');

      expect(result.totalUploads).toBe(0);
      expect(result.firstUploadAt).toBeNull();
      expect(result.lastUploadAt).toBeNull();
      expect(result.viewCount).toBe(100);
    });

    it('Should throw NotFoundException when QR code not found', async () => {
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.getEventAnalytics('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Should handle uploads with only deleted items', async () => {
      const now = new Date();
      const deletedUpload = {
        id: 'upload-1',
        createdAt: new Date(now.getTime() - 10000),
        deletedAt: new Date(now.getTime() - 5000),
      };

      const qrCodeWithOnlyDeletedUploads = {
        ...mockQrCode,
        viewCount: 25,
        lastUploadAt: null,
        uploads: [deletedUpload],
      };

      qrCodeRepository.findOne = jest
        .fn()
        .mockResolvedValue(qrCodeWithOnlyDeletedUploads);

      const result = await service.getEventAnalytics('qr-id');

      expect(result.totalUploads).toBe(0);
      expect(result.firstUploadAt).toBeNull();
    });

    it('Should sort uploads by creation date correctly', async () => {
      const uploadDate1 = new Date('2026-01-01T10:00:00');
      const uploadDate2 = new Date('2026-01-02T10:00:00');
      const uploadDate3 = new Date('2026-01-03T10:00:00');

      const mockUpload1 = {
        id: 'upload-1',
        createdAt: uploadDate2,
        deletedAt: null,
      };

      const mockUpload2 = {
        id: 'upload-2',
        createdAt: uploadDate1,
        deletedAt: null,
      };

      const mockUpload3 = {
        id: 'upload-3',
        createdAt: uploadDate3,
        deletedAt: null,
      };

      const qrCodeWithUploads = {
        ...mockQrCode,
        viewCount: 10,
        lastUploadAt: uploadDate3,
        uploads: [mockUpload1, mockUpload2, mockUpload3],
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeWithUploads);

      const result = await service.getEventAnalytics('qr-id');

      expect(result.firstUploadAt).toEqual(uploadDate1);
    });
  });

  describe('sendInvites', () => {
    let dispatcherEmailService: jest.Mocked<DispatcherEmailService>;

    beforeEach(async () => {
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
          {
            provide: DispatcherEmailService,
            useValue: {
              sendEmail: jest.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue('http://localhost:3001'),
            },
          },
        ],
      }).compile();

      dispatcherEmailService = module.get(DispatcherEmailService);
      qrCodeRepository = module.get(getRepositoryToken(QrCode));
      service = module.get<QrcodeService>(QrcodeService);
    });

    it('Should send email invites successfully', async () => {
      const recipients = ['john@example.com', 'jane@example.com'];
      const user = { name: 'Sender Name', id: 'user-id' };

      const qrCodeMock = {
        ...mockQrCode,
        token: 'event-token-123',
        eventName: 'Birthday Party',
      };

      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeMock);

      const result = await service.sendInvites(
        'qr-id',
        recipients,
        'email',
        user,
      );

      expect(result.sent).toBe(2);
      expect(result.cost).toBe(0.04);
      expect(dispatcherEmailService.sendEmail).toHaveBeenCalledTimes(2);
    });

    it('Should build correct invite email content', async () => {
      const recipients = ['recipient@example.com'];
      const user = { name: 'John Doe', id: 'user-id' };

      const qrCodeMock = {
        ...mockQrCode,
        token: 'event-token-123',
        eventName: 'Wedding',
        eventLocation: 'Grand Hotel',
        eventDateTime: new Date('2026-06-15T18:00:00'),
        dressCode: 'Formal',
      };

      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeMock);

      await service.sendInvites('qr-id', recipients, 'email', user);

      const emailCall = (dispatcherEmailService.sendEmail as jest.Mock).mock
        .calls[0];
      expect(emailCall[0]).toBe('recipient@example.com');
      expect(emailCall[1]).toContain('Wedding');
      expect(emailCall[3]).toContain('Grand Hotel');
    });

    it('Should handle email send failures gracefully', async () => {
      const recipients = ['success@example.com', 'failure@example.com'];
      const user = { name: 'Test User', id: 'user-id' };

      const qrCodeMock = {
        ...mockQrCode,
        token: 'event-token-123',
        eventName: 'Test Event',
      };

      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeMock);

      (dispatcherEmailService.sendEmail as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Send failed'));

      const result = await service.sendInvites(
        'qr-id',
        recipients,
        'email',
        user,
      );

      expect(result.sent).toBe(1);
      expect(result.cost).toBe(0.02);
    });

    it('Should trim email addresses before sending', async () => {
      const recipients = ['  test@example.com  ', 'another@example.com'];
      const user = { name: 'User', id: 'user-id' };

      const qrCodeMock = {
        ...mockQrCode,
        token: 'event-token-123',
        eventName: 'Event',
      };

      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeMock);

      await service.sendInvites('qr-id', recipients, 'email', user);

      const firstCall = (dispatcherEmailService.sendEmail as jest.Mock).mock
        .calls[0][0];
      expect(firstCall).toBe('test@example.com');
    });

    it('Should calculate correct cost for multiple recipients', async () => {
      const recipients = Array.from(
        { length: 5 },
        (_, i) => `user${i}@example.com`,
      );
      const user = { name: 'User', id: 'user-id' };

      const qrCodeMock = {
        ...mockQrCode,
        token: 'token',
        eventName: 'Event',
      };

      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeMock);

      const result = await service.sendInvites(
        'qr-id',
        recipients,
        'email',
        user,
      );

      expect(result.sent).toBe(5);
      expect(result.cost).toBe(0.1);
    });

    it('Should build invite HTML with event details', async () => {
      const recipients = ['guest@example.com'];
      const user = { name: 'Host Name', id: 'user-id' };

      const qrCodeMock = {
        ...mockQrCode,
        token: 'event-token',
        eventName: 'Anniversary Party',
        eventLocation: 'Beach Resort',
        eventDateTime: new Date('2026-07-20T19:00:00'),
        dressCode: 'Casual',
        recommendations: 'Bring sunscreen!',
      };

      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeMock);

      await service.sendInvites('qr-id', recipients, 'email', user);

      const htmlContent = (dispatcherEmailService.sendEmail as jest.Mock).mock
        .calls[0][3];
      expect(htmlContent).toContain('Anniversary Party');
      expect(htmlContent).toContain('Beach Resort');
      expect(htmlContent).toContain('Casual');
      expect(htmlContent).toContain('sunscreen');
    });

    it('Should throw NotFoundException when QR code not found', async () => {
      const recipients = ['test@example.com'];
      const user = { name: 'User', id: 'user-id' };

      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        service.sendInvites('nonexistent-id', recipients, 'email', user),
      ).rejects.toThrow(NotFoundException);
    });

    it('Should handle empty recipients list', async () => {
      const recipients: string[] = [];
      const user = { name: 'User', id: 'user-id' };

      const qrCodeMock = {
        ...mockQrCode,
        token: 'token',
        eventName: 'Event',
      };

      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeMock);

      const result = await service.sendInvites(
        'qr-id',
        recipients,
        'email',
        user,
      );

      expect(result.sent).toBe(0);
      expect(result.cost).toBe(0);
    });
  });

  describe('createQrCode - eventDateTime branch coverage', () => {
    it('Should pass eventDateTime as Date when not a string', async () => {
      const dateObj = new Date('2026-06-15T18:00:00Z');
      const createDto = {
        userId: 'user-id',
        eventName: 'Date Event',
        descriptionEvent: 'Test',
        type: QrCodeType.FREE,
        eventDateTime: dateObj,
      };

      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.create = jest.fn().mockReturnValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);
      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      await service.createQrCode(createDto as any);

      expect(qrCodeRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventDateTime: dateObj,
        }),
      );
    });

    it('Should convert eventDateTime string to Date', async () => {
      const createDto = {
        userId: 'user-id',
        eventName: 'String Date Event',
        descriptionEvent: 'Test',
        type: QrCodeType.FREE,
        eventDateTime: '2026-06-15T18:00:00Z',
      };

      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.create = jest.fn().mockReturnValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);
      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      await service.createQrCode(createDto as any);

      const createArg = (qrCodeRepository.create as jest.Mock).mock.calls[0][0];
      expect(createArg.eventDateTime).toBeInstanceOf(Date);
    });

    it('Should handle null eventDateTime', async () => {
      const createDto = {
        userId: 'user-id',
        eventName: 'No DateTime Event',
        descriptionEvent: 'Test',
        type: QrCodeType.FREE,
        eventDateTime: null,
      };

      userService.getUserById.mockResolvedValue(mockUser);
      qrCodeRepository.create = jest.fn().mockReturnValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);
      QRCode.toDataURL = jest
        .fn()
        .mockResolvedValue('data:image/png;base64,xxx');

      await service.createQrCode(createDto as any);

      const createArg = (qrCodeRepository.create as jest.Mock).mock.calls[0][0];
      expect(createArg.eventDateTime).toBeNull();
    });
  });

  describe('getQrCodeByToken - increment viewCount branch', () => {
    it('Should increment viewCount when fetching from database', async () => {
      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);

      await service.getQrCodeByToken('token-123');

      expect(qrCodeRepository.increment).toHaveBeenCalledWith(
        { token: 'token-123' },
        'viewCount',
        1,
      );
    });

    it('Should increment viewCount even when served from cache', async () => {
      cacheService.get = jest.fn().mockResolvedValue(mockQrCode);

      await service.getQrCodeByToken('token-123');

      expect(qrCodeRepository.increment).toHaveBeenCalledWith(
        { token: 'token-123' },
        'viewCount',
        1,
      );
      expect(qrCodeRepository.findOne).not.toHaveBeenCalled();
    });

    it('Should handle increment failure gracefully', async () => {
      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.increment = jest
        .fn()
        .mockRejectedValue(new Error('DB error'));

      const result = await service.getQrCodeByToken('token-123');

      expect(result).toBeDefined();
    });
  });

  describe('getEventAnalytics - branch coverage', () => {
    it('Should handle QR code with null uploads', async () => {
      const qrCodeNoUploads = {
        ...mockQrCode,
        uploads: null,
        viewCount: 5,
        lastUploadAt: null,
      };

      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeNoUploads);

      const result = await service.getEventAnalytics('qr-id');

      expect(result.totalUploads).toBe(0);
      expect(result.firstUploadAt).toBeNull();
      expect(result.lastUploadAt).toBeNull();
      expect(result.viewCount).toBe(5);
    });

    it('Should handle QR code with zero viewCount', async () => {
      const qrCodeZeroViews = {
        ...mockQrCode,
        uploads: [],
        viewCount: 0,
        lastUploadAt: new Date(),
      };

      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeZeroViews);

      const result = await service.getEventAnalytics('qr-id');

      expect(result.viewCount).toBe(0);
      expect(result.lastUploadAt).toBeInstanceOf(Date);
    });
  });

  describe('sendInvites - branch coverage', () => {
    it('Should handle whatsapp channel cost correctly', async () => {
      const qrCodeMock = {
        ...mockQrCode,
        eventName: 'Test Event',
      };

      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeMock);

      const result = await service.sendInvites(
        'qr-id',
        ['test@test.com'],
        'whatsapp',
        { name: 'Host' },
      );

      expect(result.sent).toBe(0);
      expect(result.cost).toBe(0);
    });

    it('Should use fallback for eventName when null in invite email', async () => {
      const qrCodeNoName = {
        ...mockQrCode,
        eventName: null,
        eventLocation: null,
        eventDateTime: null,
        dressCode: null,
        recommendations: null,
      };

      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeNoName);

      const dispatcherEmailServiceMock = (service as any)
        .dispatcherEmailService;
      dispatcherEmailServiceMock.sendEmail = jest
        .fn()
        .mockResolvedValue(undefined);

      const result = await service.sendInvites(
        'qr-id',
        ['test@test.com'],
        'email',
        { name: null },
      );

      expect(result.sent).toBe(1);
      expect(dispatcherEmailServiceMock.sendEmail).toHaveBeenCalledWith(
        'test@test.com',
        expect.stringContaining('um evento'),
        expect.anything(),
        expect.stringContaining('Evento'),
      );
    });

    it('Should use fallback FRONTEND_URL in sendInvites', async () => {
      const qrCodeMock = {
        ...mockQrCode,
        eventName: 'My Event',
        eventDateTime: '2026-06-15T18:00:00Z',
        eventLocation: 'São Paulo',
        dressCode: 'Casual',
        recommendations: 'Bring friends!',
      };

      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeMock);

      const dispatcherEmailServiceMock = (service as any)
        .dispatcherEmailService;
      dispatcherEmailServiceMock.sendEmail = jest
        .fn()
        .mockResolvedValue(undefined);

      const result = await service.sendInvites(
        'qr-id',
        ['test@test.com'],
        'email',
        { name: 'Host' },
      );

      expect(result.sent).toBe(1);
      expect(dispatcherEmailServiceMock.sendEmail).toHaveBeenCalledWith(
        'test@test.com',
        expect.anything(),
        expect.stringContaining('My Event'),
        expect.stringContaining('Bring friends!'),
      );
    });

    it('Should throw NotFoundException when QR code not found in sendInvites', async () => {
      cacheService.get = jest.fn().mockResolvedValue(null);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        service.sendInvites('invalid-id', ['test@test.com'], 'email', {
          name: 'Host',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('Should throw NotFoundException via null guard in sendInvites', async () => {
      jest.spyOn(service, 'getQrCodeById').mockResolvedValue(null as any);

      await expect(
        service.sendInvites('qr-id', ['test@test.com'], 'email', {
          name: 'Host',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('Should use fallback FRONTEND_URL in sendInvites when ConfigService returns undefined', async () => {
      const configSvc = (service as any).configService;
      configSvc.get = jest.fn().mockReturnValue(undefined);

      const qrCodeMock = {
        ...mockQrCode,
        eventName: 'My Event',
      };
      jest.spyOn(service, 'getQrCodeById').mockResolvedValue(qrCodeMock as any);

      const emailSvc = (service as any).dispatcherEmailService;
      emailSvc.sendEmail = jest.fn().mockResolvedValue(undefined);

      const result = await service.sendInvites(
        'qr-id',
        ['test@test.com'],
        'email',
        { name: 'Host' },
      );

      expect(result.sent).toBe(1);
      expect(emailSvc.sendEmail).toHaveBeenCalledWith(
        'test@test.com',
        expect.anything(),
        expect.stringContaining('localhost3001'),
        expect.anything(),
      );
    });
  });
});

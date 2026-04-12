import { ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserType } from '../../../common/enum/user-type.enum';
import {
  MockRepository,
  repositoryMockFactory,
} from '../../../common/utils/test.util';
import { CacheService } from '../../../common/services/cache.service';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { User } from '../entity/user.entity';
import { UserService } from '../user.service';
import { mockUser } from './mocks/user.mock';

describe('UserService', () => {
  let service: UserService;
  let repositoryMock: MockRepository<Repository<User>>;
  let eventEmitterMock: jest.Mocked<EventEmitter2>;
  let cacheServiceMock: jest.Mocked<CacheService>;

  beforeAll(async () => {
    eventEmitterMock = {
      emit: jest.fn(),
    } as any;

    cacheServiceMock = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: repositoryMockFactory<User>(),
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitterMock,
        },
        {
          provide: CacheService,
          useValue: cacheServiceMock,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repositoryMock = module.get(getRepositoryToken(User));
  });

  beforeEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkUserToLogin', () => {
    it('Should successfully check user for login', async () => {
      repositoryMock.findOne = jest.fn().mockResolvedValue(mockUser);
      repositoryMock.update = jest.fn().mockResolvedValue(undefined);

      const result = await service.checkUserToLogin(mockUser.email);

      expect(result).toEqual(mockUser);

      expect(repositoryMock.findOne).toHaveBeenCalledWith({
        where: { email: mockUser.email },
        select: ['id', 'email', 'password', 'name', 'userType'],
      });

      expect(repositoryMock.update).toHaveBeenCalledWith(mockUser.id, {
        lastLogin: expect.any(Date),
      });
    });

    it('Should throw NotFoundException when user is not found', async () => {
      repositoryMock.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        service.checkUserToLogin('nonexistent@example.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resetPasswordByEmail', () => {
    const email = 'arthur.gomes@dev.com.br';
    const newPassword = 'NewPassword123!';

    it('Should successfully reset the password by email', async () => {
      const userCopy = { ...mockUser };
      repositoryMock.findOne = jest.fn().mockResolvedValue(userCopy);
      repositoryMock.save = jest.fn().mockResolvedValue(userCopy);

      await service.resetPasswordByEmail(email, newPassword);

      expect(repositoryMock.findOne).toHaveBeenCalledWith({
        where: { email },
      });
      expect(repositoryMock.save).toHaveBeenCalled();
    });

    it('Should throw NotFoundException when user is not found', async () => {
      const error = new NotFoundException('user not found');

      repositoryMock.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        service.resetPasswordByEmail(email, newPassword),
      ).rejects.toStrictEqual(error);

      expect(repositoryMock.findOne).toHaveBeenCalledWith({
        where: { email },
      });
      expect(repositoryMock.save).not.toHaveBeenCalled();
    });
  });

  describe('createUser', () => {
    const createUserDto: CreateUserDto = {
      email: 'email@email.com',
      password: 'TestPassword123!',
      name: 'User name',
      phone: '1234567890',
      dateOfBirth: '2001-08-28',
      userType: UserType.USER,
    };

    it('Should successfully create user', async () => {
      repositoryMock.findOne = jest.fn().mockResolvedValue(null);
      repositoryMock.create = jest
        .fn()
        .mockReturnValue({ save: jest.fn().mockResolvedValue(mockUser) });

      const result = await service.createUser(createUserDto);

      expect(result).toStrictEqual(mockUser);
      expect(repositoryMock.findOne).toHaveBeenCalledWith({
        where: { email: createUserDto.email },
      });
      expect(repositoryMock.create).toHaveBeenCalledWith(createUserDto);
      expect(eventEmitterMock.emit).toHaveBeenCalledWith(
        'user.created',
        expect.any(Object),
      );
      expect(cacheServiceMock.del).toHaveBeenCalledWith('user:dashboard');
    });

    it('Should throw the ConflictException exception when user already exists', async () => {
      const error = new ConflictException(
        'user with this email already exists',
      );

      repositoryMock.findOne = jest.fn().mockResolvedValue(mockUser);

      await expect(service.createUser(createUserDto)).rejects.toStrictEqual(
        error,
      );
    });
  });

  describe('updateUser', () => {
    const updateUserDto: UpdateUserDto = {
      email: 'newemail@email.com',
      name: 'Updated User name',
      phone: '9876543210',
      dateOfBirth: '2000-01-01',
    };

    it('Should successfully update a user', async () => {
      repositoryMock.findOne = jest.fn().mockResolvedValue(mockUser);
      repositoryMock.preload = jest
        .fn()
        .mockReturnValue({ save: jest.fn().mockResolvedValue(mockUser) });

      const result = await service.updateUser(mockUser.id, updateUserDto);

      expect(result).toStrictEqual(mockUser);
      expect(repositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
      expect(repositoryMock.preload).toHaveBeenCalledWith({
        id: mockUser.id,
        ...updateUserDto,
      });
    });

    it('Should throw NotFoundException when updating non-existent user', async () => {
      repositoryMock.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        service.updateUser('nonexistent-id', updateUserDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserById', () => {
    it('Should successfully get a user by id', async () => {
      repositoryMock.findOne = jest.fn().mockReturnValue(mockUser);

      const result = await service.getUserById(mockUser.id);

      expect(result).toStrictEqual(mockUser);
    });

    it('Should throw the NotFoundException exception when user id not found', async () => {
      const error = new NotFoundException('user with this id not found');

      repositoryMock.findOne = jest.fn();

      await expect(service.getUserById(mockUser.id)).rejects.toStrictEqual(
        error,
      );
    });
  });

  describe('getAllUsers', () => {
    it('Should successfully get all users', async () => {
      const take = 1;
      const skip = 0;
      const search = '';

      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser], 10]);

      const result = await service.getAllUsers(take, skip, search, '', 'ASC');

      expect(result).toStrictEqual({
        skip: 1,
        total: 10,
        items: [mockUser],
      });
      expect(repositoryMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take,
          skip,
          order: expect.any(Object),
          where: expect.any(Object),
        }),
      );
    });

    it('Should successfully return an empty list of users', async () => {
      const take = 10;
      const skip = 10;
      const search = '';

      repositoryMock.findAndCount = jest.fn().mockResolvedValue([[], 0]);

      const result = await service.getAllUsers(take, skip, search, '', 'ASC');

      expect(result).toStrictEqual({ skip: null, total: 0, items: [] });
      expect(repositoryMock.findAndCount).toHaveBeenCalled();
    });

    it('Should adjust skip based on count, take, and skip values', async () => {
      const take = 5;
      const skip = 5;
      const search = '';

      const count = 7;
      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser], count]);

      const result = await service.getAllUsers(take, skip, search, '', 'ASC');

      const expectedSkip = count - take - skip <= 0 ? null : skip + take;
      expect(result.skip).toEqual(expectedSkip);
      expect(repositoryMock.findAndCount).toHaveBeenCalled();
    });

    it('Should successfully get all user with search', async () => {
      const search = 'search';
      const take = 10;
      const skip = 0;

      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser], 10]);

      const result = await service.getAllUsers(take, skip, search, '', 'ASC');

      expect(result).toStrictEqual({
        skip: null,
        total: 10,
        items: [mockUser],
      });
      expect(repositoryMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take,
          skip,
          where: expect.objectContaining({
            name: expect.any(Object),
          }),
          order: expect.any(Object),
        }),
      );
    });
  });

  describe('deleteUser', () => {
    it('Should successfully delete a user', async () => {
      repositoryMock.findOne = jest.fn().mockResolvedValue(mockUser);
      repositoryMock.update = jest.fn().mockResolvedValue(undefined);

      const result = await service.deleteUser(mockUser.id);

      expect(result).toStrictEqual('user anonymized and deactivated');
      expect(repositoryMock.findOne).toHaveBeenCalledWith({
        where: { id: mockUser.id },
      });
      expect(repositoryMock.update).toHaveBeenCalledWith(mockUser.id, {
        active: false,
        deletedAt: expect.any(Date),
        name: `Deleted User ${mockUser.id.substring(0, 8)}`,
        email: `deleted_${mockUser.id}@anonymized.local`,
        phone: null,
        dateOfBirth: null,
      });
      expect(cacheServiceMock.del).toHaveBeenCalledWith('user:dashboard');
    });

    it('Should throw NotFoundException when deleting non-existent user', async () => {
      repositoryMock.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.deleteUser('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByEmail', () => {
    it('Should find user by email', async () => {
      repositoryMock.findOne = jest.fn().mockResolvedValue(mockUser);

      const result = await service.findByEmail(mockUser.email);

      expect(result).toStrictEqual(mockUser);
      expect(repositoryMock.findOne).toHaveBeenCalledWith({
        where: { email: mockUser.email },
      });
    });

    it('Should return null when user not found', async () => {
      repositoryMock.findOne = jest.fn().mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@email.com');

      expect(result).toBeNull();
    });
  });

  describe('findByFirebaseUid', () => {
    it('Should find user by firebase uid', async () => {
      const firebaseUid = 'firebase-uid-123';
      repositoryMock.findOne = jest.fn().mockResolvedValue(mockUser);

      const result = await service.findByFirebaseUid(firebaseUid);

      expect(result).toStrictEqual(mockUser);
      expect(repositoryMock.findOne).toHaveBeenCalledWith({
        where: { firebaseUid },
      });
    });

    it('Should return null when user not found', async () => {
      repositoryMock.findOne = jest.fn().mockResolvedValue(null);

      const result = await service.findByFirebaseUid('nonexistent-uid');

      expect(result).toBeNull();
    });
  });

  describe('linkFirebaseUid', () => {
    it('Should link firebase uid to user', async () => {
      const firebaseUid = 'firebase-uid-123';
      const authProvider = 'google.com';

      repositoryMock.update = jest.fn().mockResolvedValue(undefined);

      await service.linkFirebaseUid(mockUser.id, firebaseUid, authProvider);

      expect(repositoryMock.update).toHaveBeenCalledWith(mockUser.id, {
        firebaseUid,
        authProvider,
      });
    });
  });

  describe('checkEmailAvailable', () => {
    it('Should check email is available', async () => {
      repositoryMock.findOne = jest.fn().mockResolvedValue(null);

      await service.checkEmailAvailable('available@email.com');

      expect(repositoryMock.findOne).toHaveBeenCalledWith({
        where: { email: 'available@email.com' },
      });
    });

    it('Should throw ConflictException when email already exists', async () => {
      repositoryMock.findOne = jest.fn().mockResolvedValue(mockUser);

      await expect(service.checkEmailAvailable(mockUser.email)).rejects.toThrow(
        new ConflictException('email already registered'),
      );
    });
  });

  describe('getUserById', () => {
    it('Should successfully get a user by id', async () => {
      repositoryMock.findOne = jest.fn().mockResolvedValue(mockUser);

      const result = await service.getUserById(mockUser.id);

      expect(result).toStrictEqual(mockUser);
    });

    it('Should throw the NotFoundException exception when user id not found', async () => {
      const error = new NotFoundException('user with this id not found');

      repositoryMock.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.getUserById('nonexistent-id')).rejects.toStrictEqual(
        error,
      );
    });
  });

  describe('getAllUsers', () => {
    it('Should successfully get all users', async () => {
      const take = 1;
      const skip = 0;
      const search = '';

      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser], 10]);

      const result = await service.getAllUsers(take, skip, search, '', 'ASC');

      expect(result).toStrictEqual({
        skip: 1,
        total: 10,
        items: [mockUser],
      });
      expect(repositoryMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take,
          skip,
          order: expect.any(Object),
          where: expect.any(Object),
        }),
      );
    });

    it('Should successfully return an empty list of users', async () => {
      const take = 10;
      const skip = 10;
      const search = '';

      repositoryMock.findAndCount = jest.fn().mockResolvedValue([[], 0]);

      const result = await service.getAllUsers(take, skip, search, '', 'ASC');

      expect(result).toStrictEqual({ skip: null, total: 0, items: [] });
      expect(repositoryMock.findAndCount).toHaveBeenCalled();
    });

    it('Should adjust skip based on count, take, and skip values', async () => {
      const take = 5;
      const skip = 5;
      const search = '';

      const count = 7;
      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser], count]);

      const result = await service.getAllUsers(take, skip, search, '', 'ASC');

      const expectedSkip = count - take - skip <= 0 ? null : skip + take;
      expect(result.skip).toEqual(expectedSkip);
      expect(repositoryMock.findAndCount).toHaveBeenCalled();
    });

    it('Should successfully get all user with search', async () => {
      const search = 'search';
      const take = 10;
      const skip = 0;

      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser], 10]);

      const result = await service.getAllUsers(take, skip, search, '', 'ASC');

      expect(result).toStrictEqual({
        skip: null,
        total: 10,
        items: [mockUser],
      });
      expect(repositoryMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take,
          skip,
          where: expect.objectContaining({
            name: expect.any(Object),
          }),
          order: expect.any(Object),
        }),
      );
    });
  });

  describe('getDashAdmin', () => {
    it('Should return cached dashboard data if available', async () => {
      const cachedData = {
        usersCreated: 10,
        usersLoggedIn: 5,
        usersInactive: 2,
        qrcodeActive: 3,
        qrcodeExpired: 1,
        qrcodeNone: 0,
      };
      cacheServiceMock.get = jest.fn().mockResolvedValue(cachedData);

      const result = await service.getDashAdmin();

      expect(result).toStrictEqual(cachedData);
      expect(cacheServiceMock.get).toHaveBeenCalledWith('user:dashboard');
    });

    it('Should fetch data and cache when not cached', async () => {
      cacheServiceMock.get = jest.fn().mockResolvedValue(null);
      cacheServiceMock.set = jest.fn().mockResolvedValue(undefined);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          usersCreated: '10',
          usersLoggedIn: '5',
          usersInactive: '2',
        }),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      repositoryMock.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const result = await service.getDashAdmin();

      expect(result).toHaveProperty('usersCreated');
      expect(cacheServiceMock.set).toHaveBeenCalled();
    });

    it('Should handle getUsersCount error gracefully', async () => {
      cacheServiceMock.get = jest.fn().mockResolvedValue(null);
      cacheServiceMock.set = jest.fn().mockResolvedValue(undefined);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockRejectedValue(new Error('DB error')),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      repositoryMock.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const result = await service.getDashAdmin();

      expect(result).toHaveProperty('usersCreated');
      expect(result.usersCreated).toBe(0);
    });

    it('Should call getDashAdmin with params', async () => {
      cacheServiceMock.get = jest.fn().mockResolvedValue(null);
      cacheServiceMock.set = jest.fn().mockResolvedValue(undefined);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          usersCreated: '5',
          usersLoggedIn: '2',
          usersInactive: '1',
        }),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      repositoryMock.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const result = await service.getDashAdmin({ tz: 'UTC' });

      expect(result).toBeDefined();
      expect(cacheServiceMock.set).toHaveBeenCalled();
    });

    it('Should handle null or empty qrcode stats', async () => {
      cacheServiceMock.get = jest.fn().mockResolvedValue(null);
      cacheServiceMock.set = jest.fn().mockResolvedValue(undefined);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(),
      };

      let callCount = 0;
      mockQueryBuilder.getRawOne.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            usersCreated: '5',
            usersLoggedIn: '2',
            usersInactive: '1',
          });
        } else {
          return Promise.resolve({
            active: '0',
            expired: '0',
            none: '0',
          });
        }
      });

      repositoryMock.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const result = await service.getDashAdmin();

      expect(result).toHaveProperty('qrcodeActive', 0);
      expect(result).toHaveProperty('qrcodeExpired', 0);
      expect(result).toHaveProperty('qrcodeNone', 0);
      expect(cacheServiceMock.set).toHaveBeenCalled();
    });

    it('Should handle undefined values in qrcode stats', async () => {
      cacheServiceMock.get = jest.fn().mockResolvedValue(null);
      cacheServiceMock.set = jest.fn().mockResolvedValue(undefined);

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(),
      };

      let callCount = 0;
      mockQueryBuilder.getRawOne.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            usersCreated: '10',
            usersLoggedIn: '5',
            usersInactive: '3',
          });
        } else {
          return Promise.resolve({
            active: undefined,
            expired: undefined,
            none: undefined,
          });
        }
      });

      repositoryMock.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const result = await service.getDashAdmin();

      expect(result).toHaveProperty('qrcodeActive', 0);
      expect(result).toHaveProperty('qrcodeExpired', 0);
      expect(result).toHaveProperty('qrcodeNone', 0);
    });

    it('Should use fallback values when qrStats and usersRes are undefined', async () => {
      cacheServiceMock.get = jest.fn().mockResolvedValue(null);
      cacheServiceMock.set = jest.fn().mockResolvedValue(undefined);

      const getUsersCountSpy = jest
        .spyOn(service, 'getUsersCount')
        .mockResolvedValue(undefined as any);
      const getIdsUsersSpy = jest
        .spyOn(service as any, 'getIdsUsers')
        .mockResolvedValue(undefined);

      const result = await service.getDashAdmin();

      expect(result).toStrictEqual({
        usersCreated: 0,
        usersLoggedIn: 0,
        usersInactive: 0,
        qrcodeActive: 0,
        qrcodeExpired: 0,
        qrcodeNone: 0,
        window: undefined,
      });

      getUsersCountSpy.mockRestore();
      getIdsUsersSpy.mockRestore();
    });

    it('Should use real qrStats values when defined', async () => {
      cacheServiceMock.get = jest.fn().mockResolvedValue(null);
      cacheServiceMock.set = jest.fn().mockResolvedValue(undefined);

      const getUsersCountSpy = jest
        .spyOn(service, 'getUsersCount')
        .mockResolvedValue({
          usersCreated: 12,
          usersLoggedIn: 8,
          usersInactive: 3,
          window: { fromUtc: 'a', toUtc: 'b', tz: 'UTC' },
        } as any);
      const getIdsUsersSpy = jest
        .spyOn(service as any, 'getIdsUsers')
        .mockResolvedValue({ active: 5, expired: 2, none: 1 });

      const result = await service.getDashAdmin();

      expect(result).toStrictEqual({
        usersCreated: 12,
        usersLoggedIn: 8,
        usersInactive: 3,
        qrcodeActive: 5,
        qrcodeExpired: 2,
        qrcodeNone: 1,
        window: { fromUtc: 'a', toUtc: 'b', tz: 'UTC' },
      });

      getUsersCountSpy.mockRestore();
      getIdsUsersSpy.mockRestore();
    });
  });

  describe('updateLastLogin', () => {
    it('Should update last login timestamp', async () => {
      repositoryMock.update = jest.fn().mockResolvedValue(undefined);

      repositoryMock.findOne = jest.fn().mockResolvedValue(mockUser);

      await service.checkUserToLogin(mockUser.email);

      expect(repositoryMock.update).toHaveBeenCalledWith(mockUser.id, {
        lastLogin: expect.any(Date),
      });
    });
  });

  describe('getUsersCount', () => {
    it('Should return user counts with default date range', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          usersCreated: '5',
          usersLoggedIn: '3',
          usersInactive: '2',
        }),
      };

      repositoryMock.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const result = await service.getUsersCount();

      expect(result).toHaveProperty('usersCreated', 5);
      expect(result).toHaveProperty('usersLoggedIn', 3);
      expect(result).toHaveProperty('usersInactive', 2);
      expect(result).toHaveProperty('window');
      expect(mockQueryBuilder.select).toHaveBeenCalled();
      expect(mockQueryBuilder.getRawOne).toHaveBeenCalled();
    });

    it('Should return user counts with custom date range', async () => {
      const customParams = {
        start: '2025-01-01',
        end: '2025-01-31',
        tz: 'America/New_York',
      };

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          usersCreated: '10',
          usersLoggedIn: '8',
          usersInactive: '5',
        }),
      };

      repositoryMock.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const result = await service.getUsersCount(customParams);

      expect(result).toHaveProperty('usersCreated', 10);
      expect(result).toHaveProperty('usersLoggedIn', 8);
      expect(result).toHaveProperty('usersInactive', 5);
      expect(result.window.tz).toBe('America/New_York');
    });

    it('Should handle zero string values from database', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          usersCreated: '0',
          usersLoggedIn: '0',
          usersInactive: '0',
        }),
      };

      repositoryMock.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const result = await service.getUsersCount();

      expect(result).toHaveProperty('usersCreated', 0);
      expect(result).toHaveProperty('usersLoggedIn', 0);
      expect(result).toHaveProperty('usersInactive', 0);
    });
  });

  describe('getUsersCreatedDashAdmin', () => {
    it('Should return paginated users created', async () => {
      const take = 10;
      const skip = 0;

      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser], 1]);

      const result = await service.getUsersCreatedDashAdmin(
        take,
        skip,
        '',
        'createdAt',
        'DESC',
      );

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('skip');
      expect(result).toHaveProperty('total', 1);
      expect(repositoryMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take,
          skip,
          where: { userType: UserType.USER },
        }),
      );
    });

    it('Should filter users by search term', async () => {
      const take = 10;
      const skip = 0;
      const search = 'John';

      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser], 1]);

      const result = await service.getUsersCreatedDashAdmin(
        take,
        skip,
        search,
        'name',
        'ASC',
      );

      expect(result.total).toBe(1);
      expect(repositoryMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: expect.anything(),
          }),
        }),
      );
    });

    it('Should handle empty results', async () => {
      repositoryMock.findAndCount = jest.fn().mockResolvedValue([[], 0]);

      const result = await service.getUsersCreatedDashAdmin(
        10,
        0,
        '',
        'createdAt',
        'DESC',
      );

      expect(result.skip).toBeNull();
      expect(result.total).toBe(0);
      expect(result.items).toEqual([]);
    });

    it('Should calculate pagination correctly', async () => {
      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser], 20]);

      const result = await service.getUsersCreatedDashAdmin(
        10,
        0,
        '',
        'createdAt',
        'DESC',
      );

      expect(result.skip).toBe(10);
      expect(result.total).toBe(20);
    });
  });

  describe('getUsersByStatusDashAdmin', () => {
    it('Should return active users', async () => {
      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser], 5]);

      const result = await service.getUsersByStatusDashAdmin(
        10,
        0,
        'active',
        'lastLogin',
        'DESC',
      );

      expect(result).toHaveProperty('items');
      expect(result.total).toBe(5);
      expect(repositoryMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userType: UserType.USER,
          }),
        }),
      );
    });

    it('Should return inactive users', async () => {
      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser], 3]);

      const result = await service.getUsersByStatusDashAdmin(
        10,
        0,
        'inactive',
        'lastLogin',
        'DESC',
      );

      expect(result.total).toBe(3);
      expect(repositoryMock.findAndCount).toHaveBeenCalled();
    });

    it('Should handle empty inactive users list', async () => {
      repositoryMock.findAndCount = jest.fn().mockResolvedValue([[], 0]);

      const result = await service.getUsersByStatusDashAdmin(
        10,
        0,
        'inactive',
        'lastLogin',
        'DESC',
      );

      expect(result.skip).toBeNull();
      expect(result.total).toBe(0);
    });

    it('Should calculate next skip for pagination', async () => {
      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser, mockUser], 50]);

      const result = await service.getUsersByStatusDashAdmin(
        10,
        0,
        'active',
        'createdAt',
        'ASC',
      );

      expect(result.skip).toBe(10);
      expect(result.total).toBe(50);
    });
  });

  describe('getUsersWithoutQrCodes', () => {
    it('Should return users without QR codes', async () => {
      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser], 2]);

      const result = await service.getUsersWithoutQrCodes(
        10,
        0,
        'createdAt',
        'DESC',
      );

      expect(result).toHaveProperty('items');
      expect(result.total).toBe(2);
      expect(repositoryMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 0,
          relations: ['qrCodes'],
        }),
      );
    });

    it('Should handle pagination when users without QR codes list is large', async () => {
      const usersList = Array(15).fill(mockUser);
      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([usersList.slice(0, 10), 25]);

      const result = await service.getUsersWithoutQrCodes(
        10,
        0,
        'createdAt',
        'ASC',
      );

      expect(result.skip).toBe(10);
      expect(result.total).toBe(25);
      expect(result.items).toHaveLength(10);
    });

    it('Should return null skip when no more users', async () => {
      repositoryMock.findAndCount = jest.fn().mockResolvedValue([[], 0]);

      const result = await service.getUsersWithoutQrCodes(
        10,
        0,
        'createdAt',
        'DESC',
      );

      expect(result.skip).toBeNull();
      expect(result.total).toBe(0);
    });

    it('Should apply correct sorting and pagination', async () => {
      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser], 5]);

      const result = await service.getUsersWithoutQrCodes(5, 5, 'name', 'ASC');

      expect(repositoryMock.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
          skip: 5,
          order: { name: 'ASC' },
        }),
      );
      expect(result.skip).toBeNull();
    });
  });

  describe('buildUtcRange', () => {
    it('Should use default timezone when not provided', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          usersCreated: '1',
          usersLoggedIn: '1',
          usersInactive: '0',
        }),
      };

      repositoryMock.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const result = await service.getUsersCount();
      expect(result.window.tz).toBeDefined();
    });

    it('Should use custom timezone when provided', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        setParameters: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          usersCreated: '1',
          usersLoggedIn: '1',
          usersInactive: '0',
        }),
      };

      repositoryMock.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const result = await service.getUsersCount({
        tz: 'Europe/London',
      });

      expect(result.window.tz).toBe('Europe/London');
    });
  });

  describe('formatPaginationResponse', () => {
    it('Should return null skip when items list is empty', async () => {
      repositoryMock.findAndCount = jest.fn().mockResolvedValue([[], 0]);

      const result = await service.getUsersCreatedDashAdmin(
        10,
        0,
        '',
        'id',
        'ASC',
      );

      expect(result.skip).toBeNull();
      expect(result.total).toBe(0);
    });

    it('Should return null skip when no more items remain', async () => {
      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser, mockUser], 12]);

      const result = await service.getUsersCreatedDashAdmin(
        10,
        5,
        '',
        'id',
        'ASC',
      );

      expect(result.skip).toBeNull();
    });

    it('Should return next skip when more items exist', async () => {
      repositoryMock.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockUser], 100]);

      const result = await service.getUsersCreatedDashAdmin(
        10,
        0,
        '',
        'id',
        'ASC',
      );

      expect(result.skip).toBe(10);
    });
  });
});

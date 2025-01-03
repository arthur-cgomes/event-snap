import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from '../user.service';
import {
  MockRepository,
  repositoryMockFactory,
} from '../../common/utils/test.util';
import { FindManyOptions, ILike, Repository } from 'typeorm';
import { User } from '../entity/user.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreateUserDto } from '../dto/create-user.dto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UpdateUserDto } from '../dto/update-user.dto';
import { mockUser } from './mocks/user.mock';
import { UserType } from '../../common/enum/user-type.enum';

describe('UserService', () => {
  let service: UserService;
  let repositoryMock: MockRepository<Repository<User>>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: repositoryMockFactory<User>(),
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
  });

  describe('resetPassword', () => {
    const name = 'Arthur Gomes';
    const email = 'arthur.gomes@dev.com.br';
    const newPassword = 'newPassword123';

    it('Should successfully reset the password when name and email match', async () => {
      repositoryMock.findOne = jest.fn().mockReturnValue(mockUser);
      repositoryMock.save = jest.fn().mockResolvedValue(mockUser);

      await service.resetPassword(name, email, newPassword);

      expect(repositoryMock.findOne).toHaveBeenCalledWith({
        where: { name, email },
      });
      expect(mockUser.password).toBe(newPassword);
      expect(repositoryMock.save).toHaveBeenCalledWith(mockUser);
    });

    it('Should throw NotFoundException when user is not found', async () => {
      repositoryMock.findOne = jest.fn().mockReturnValue(null);

      await expect(
        service.resetPassword(name, email, newPassword),
      ).rejects.toThrow(
        new NotFoundException('user not found with the data provided'),
      );

      expect(repositoryMock.findOne).toHaveBeenCalledWith({
        where: { name, email },
      });
      expect(repositoryMock.save).not.toHaveBeenCalled();
    });

    it('Should throw NotFoundException when user does not exist', async () => {
      const nonExistentEmail = 'nonexistent@email.com';
      const error = new NotFoundException('user with this email not found');

      repositoryMock.findOne = jest.fn().mockResolvedValue(undefined);

      await expect(
        service.checkUserToLogin(nonExistentEmail),
      ).rejects.toStrictEqual(error);

      expect(repositoryMock.findOne).toHaveBeenCalledWith({
        where: { email: nonExistentEmail },
        select: ['id', 'email', 'password', 'name', 'userType'],
      });
    });
  });

  describe('createUser', () => {
    const createUserDto: CreateUserDto = {
      email: 'email@email.com',
      password: '12345678',
      name: 'User name',
      createdBy: 'User',
      createdById: '1',
      userType: UserType.USER,
    };

    it('Should successfully create user', async () => {
      repositoryMock.findOne = jest.fn();
      repositoryMock.create = jest
        .fn()
        .mockReturnValue({ save: () => mockUser });

      const result = await service.createUser(createUserDto);

      expect(result).toStrictEqual(mockUser);
      expect(repositoryMock.create).toHaveBeenCalledWith({
        ...createUserDto,
      });
    });

    it('Should throw the ConflictException exception when user already exists', async () => {
      const error = new ConflictException(
        'user with this email already exists',
      );

      repositoryMock.findOne = jest.fn().mockReturnValue(mockUser);

      await expect(service.createUser(createUserDto)).rejects.toStrictEqual(
        error,
      );
    });
  });

  describe('updateUser', () => {
    const updateUserDto: UpdateUserDto = {
      email: 'email@email.com',
      name: 'User name',
      createdBy: 'User',
      createdById: '1',
      userType: UserType.USER,
    };

    it('Should successfully update a user', async () => {
      repositoryMock.findOne = jest.fn().mockReturnValue(mockUser);
      repositoryMock.preload = jest
        .fn()
        .mockReturnValue({ save: () => mockUser });

      const result = await service.updateUser(mockUser.id, updateUserDto);

      expect(result).toStrictEqual(mockUser);
      expect(repositoryMock.preload).toHaveBeenCalledWith({
        id: mockUser.id,
        ...updateUserDto,
      });
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
      const conditions: FindManyOptions<User> = {
        take,
        skip,
        order: expect.any(Object),
      };

      repositoryMock.findAndCount = jest.fn().mockReturnValue([[mockUser], 10]);

      const result = await service.getAllUsers(take, skip, search, '', 'ASC');

      expect(result).toStrictEqual({
        skip: 1,
        total: 10,
        items: [mockUser],
      });
      expect(repositoryMock.findAndCount).toHaveBeenCalledWith(conditions);
    });

    it('Should successfully return an empty list of users', async () => {
      const take = 10;
      const skip = 10;
      const search = '';
      const conditions: FindManyOptions<User> = {
        take,
        skip,
        order: expect.any(Object),
      };

      repositoryMock.findAndCount = jest.fn().mockReturnValue([[], 0]);

      const result = await service.getAllUsers(take, skip, search, '', 'ASC');

      expect(result).toStrictEqual({ skip: null, total: 0, items: [] });
      expect(repositoryMock.findAndCount).toHaveBeenCalledWith(conditions);
    });

    it('Should adjust skip based on count, take, and skip values', async () => {
      const take = 5;
      const skip = 5;
      const search = '';
      const conditions: FindManyOptions<User> = {
        take,
        skip,
        order: expect.any(Object),
      };

      const count = 7;
      repositoryMock.findAndCount = jest
        .fn()
        .mockReturnValue([[mockUser], count]);

      const result = await service.getAllUsers(take, skip, search, '', 'ASC');

      const expectedSkip = count - take - skip <= 0 ? null : skip + take;
      expect(result.skip).toEqual(expectedSkip);
      expect(repositoryMock.findAndCount).toHaveBeenCalledWith(conditions);
    });

    it('Should successfully get all user with search', async () => {
      const search = 'search';
      const take = 10;
      const skip = 0;

      const conditions: FindManyOptions<User> = {
        take,
        skip,
        order: expect.any(Object),
        where: { name: ILike('%' + search + '%') },
      };

      repositoryMock.findAndCount = jest.fn().mockReturnValue([[mockUser], 10]);

      const result = await service.getAllUsers(take, skip, search, '', 'ASC');

      expect(result).toStrictEqual({
        skip: null,
        total: 10,
        items: [mockUser],
      });
      expect(repositoryMock.findAndCount).toHaveBeenCalledWith(conditions);
    });
  });

  describe('deleteUser', () => {
    it('Should successfully delete a user', async () => {
      repositoryMock.findOne = jest.fn().mockReturnValue(mockUser);
      repositoryMock.remove = jest.fn();

      const result = await service.deleteUser(mockUser.id);

      expect(result).toStrictEqual('removed');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { UserService } from '../../user/user.service';
import { User } from '../../user/entity/user.entity';
import { JwtService } from '@nestjs/jwt';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthPayload } from '../interfaces/auth.interface';
import { mockJwtPayload, mockJwtResponse, mockUser } from './mocks/auth.mock';

describe('AuthService', () => {
  let service: AuthService;
  let userService: UserService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserService,
          useValue: {
            checkUserToLogin: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userService = module.get<UserService>(UserService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('Should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUserByPassword', () => {
    it('Should return JwtResponse if password is valid', async () => {
      const loginAttempt: AuthPayload = {
        email: 'test@example.com',
        password: 'password',
      };
      const mockUserWithPasswordCheck = {
        ...mockUser,
        checkPassword: jest.fn().mockReturnValue(true),
      };

      jest
        .spyOn(userService, 'checkUserToLogin')
        .mockResolvedValue(mockUserWithPasswordCheck as unknown as User);
      jest
        .spyOn(service, 'createJwtPayload')
        .mockResolvedValue(mockJwtResponse);

      const result = await service.validateUserByPassword(loginAttempt);

      expect(result).toEqual(mockJwtResponse);
      expect(userService.checkUserToLogin).toHaveBeenCalledWith(
        loginAttempt.email,
      );
      expect(mockUserWithPasswordCheck.checkPassword).toHaveBeenCalledWith(
        loginAttempt.password,
      );
    });

    it('Should throw ForbiddenException if password is invalid', async () => {
      const loginAttempt: AuthPayload = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };
      const mockUserWithPasswordCheck = {
        ...mockUser,
        checkPassword: jest.fn().mockReturnValue(false),
      };

      jest
        .spyOn(userService, 'checkUserToLogin')
        .mockResolvedValue(mockUserWithPasswordCheck as unknown as User);

      await expect(
        service.validateUserByPassword(loginAttempt),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('createJwtPayload', () => {
    it('Should return a valid JwtResponse', async () => {
      jest.spyOn(jwtService, 'sign').mockReturnValue('jwt_token');

      const result = await service.createJwtPayload(mockUser);

      expect(result).toEqual({
        expiresIn: parseInt(process.env.EXPIRE_IN),
        token: 'jwt_token',
        userId: mockUser.id,
        name: mockUser.name,
      });
    });
  });

  describe('validateUserByJwt', () => {
    it('Should return a valid JwtResponse if user is found', async () => {
      jest.spyOn(userService, 'checkUserToLogin').mockResolvedValue(mockUser);
      jest
        .spyOn(service, 'createJwtPayload')
        .mockResolvedValue(mockJwtResponse);

      const result = await service.validateUserByJwt(mockJwtPayload);

      expect(result).toEqual(mockJwtResponse);
      expect(userService.checkUserToLogin).toHaveBeenCalledWith(
        mockJwtPayload.email,
      );
    });

    it('Should throw UnauthorizedException if user is not found', async () => {
      jest.spyOn(userService, 'checkUserToLogin').mockResolvedValue(null);

      await expect(service.validateUserByJwt(mockJwtPayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

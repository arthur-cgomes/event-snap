import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { Redis } from 'ioredis';
import { User } from '../../user/entity/user.entity';
import { UserService } from '../../user/user.service';
import { EmailService } from '../../email/email.service';
import { AuthService } from '../auth.service';
import { AuthPayload } from '../interfaces/auth.interface';
import { mockJwtPayload, mockUser } from './mocks/auth.mock';

jest.mock('../../../common/config/firebase.config', () => ({
  getFirebaseAuth: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getFirebaseAuth } = require('../../../common/config/firebase.config');

describe('AuthService', () => {
  let service: AuthService;
  let userService: jest.Mocked<UserService>;
  let jwtService: jest.Mocked<JwtService>;
  let emailService: jest.Mocked<EmailService>;
  let redisMock: jest.Mocked<Redis>;

  beforeEach(async () => {
    redisMock = {
      ttl: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      get: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserService,
          useValue: {
            checkUserToLogin: jest.fn(),
            findByEmail: jest.fn(),
            findByFirebaseUid: jest.fn(),
            linkFirebaseUid: jest.fn(),
            createUser: jest.fn(),
            getUserById: jest.fn(),
            resetPasswordByEmail: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            decode: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendBrevo: jest.fn(),
          },
        },
        {
          provide: 'REDIS',
          useValue: redisMock,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userService = module.get(UserService) as jest.Mocked<UserService>;
    jwtService = module.get(JwtService) as jest.Mocked<JwtService>;
    emailService = module.get(EmailService) as jest.Mocked<EmailService>;
  });

  afterEach(() => jest.clearAllMocks());

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

      userService.checkUserToLogin.mockResolvedValue(
        mockUserWithPasswordCheck as unknown as User,
      );
      jwtService.sign.mockReturnValue('jwt_token');
      process.env.EXPIRE_IN = '7200';

      const result = await service.validateUserByPassword(loginAttempt);

      expect(result).toEqual({
        expiresIn: 7200,
        token: 'jwt_token',
        userId: mockUser.id,
        name: mockUser.name,
        userType: mockUser.userType,
      });
      expect(userService.checkUserToLogin).toHaveBeenCalledWith(
        loginAttempt.email,
      );
    });

    it('Should throw UnauthorizedException if password is invalid', async () => {
      const loginAttempt: AuthPayload = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };
      const mockUserWithPasswordCheck = {
        ...mockUser,
        checkPassword: jest.fn().mockReturnValue(false),
      };

      userService.checkUserToLogin.mockResolvedValue(
        mockUserWithPasswordCheck as unknown as User,
      );

      await expect(
        service.validateUserByPassword(loginAttempt),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('createJwtPayload', () => {
    it('Should return a valid JwtResponse', async () => {
      jwtService.sign.mockReturnValue('jwt_token');
      process.env.EXPIRE_IN = '7200';

      const result = await service.createJwtPayload(mockUser);

      expect(result).toEqual({
        expiresIn: 7200,
        token: 'jwt_token',
        userId: mockUser.id,
        name: mockUser.name,
        userType: mockUser.userType,
      });
    });
  });

  describe('validateUserByJwt', () => {
    it('Should return user if found by email', async () => {
      userService.findByEmail.mockResolvedValue(mockUser);

      const result = await service.validateUserByJwt(mockJwtPayload);

      expect(result).toEqual(mockUser);
      expect(userService.findByEmail).toHaveBeenCalledWith(
        mockJwtPayload.email,
      );
    });

    it('Should throw UnauthorizedException if user is not found', async () => {
      userService.findByEmail.mockResolvedValue(null);

      await expect(service.validateUserByJwt(mockJwtPayload)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('generateAndSendCode', () => {
    it('Should generate and send code for signup', async () => {
      const email = 'test@example.com';
      const purpose: 'signup' | 'reset' | 'update' = 'signup';

      redisMock.ttl.mockResolvedValue(-2);
      redisMock.set.mockResolvedValue('OK');
      redisMock.setex.mockResolvedValue('OK');
      emailService.sendBrevo.mockResolvedValue({ messageId: '123' });

      const result = await service.generateAndSendCode(email, purpose);

      expect(result).toEqual({
        message: `code sent to ${email}`,
      });
      expect(redisMock.ttl).toHaveBeenCalledWith(
        `cooldown:${purpose}:${email}`,
      );
      expect(redisMock.set).toHaveBeenCalled();
      expect(redisMock.setex).toHaveBeenCalled();
      expect(emailService.sendBrevo).toHaveBeenCalledWith(
        email,
        expect.any(String),
        expect.any(String),
        expect.any(String),
      );
    });

    it('Should generate and send code for reset', async () => {
      const email = 'test@example.com';
      const purpose: 'signup' | 'reset' | 'update' = 'reset';

      redisMock.ttl.mockResolvedValue(-2);
      redisMock.set.mockResolvedValue('OK');
      redisMock.setex.mockResolvedValue('OK');
      emailService.sendBrevo.mockResolvedValue({ messageId: '123' });

      const result = await service.generateAndSendCode(email, purpose);

      expect(result).toEqual({
        message: `code sent to ${email}`,
      });
      expect(emailService.sendBrevo).toHaveBeenCalled();
    });

    it('Should generate and send code for update', async () => {
      const email = 'test@example.com';
      const purpose: 'signup' | 'reset' | 'update' = 'update';

      redisMock.ttl.mockResolvedValue(-2);
      redisMock.set.mockResolvedValue('OK');
      redisMock.setex.mockResolvedValue('OK');
      emailService.sendBrevo.mockResolvedValue({ messageId: '123' });

      const result = await service.generateAndSendCode(email, purpose);

      expect(result).toEqual({
        message: `code sent to ${email}`,
      });
      expect(emailService.sendBrevo).toHaveBeenCalled();
    });

    it('Should throw BadRequestException if cooldown active', async () => {
      const email = 'test@example.com';
      const purpose: 'signup' | 'reset' | 'update' = 'signup';

      redisMock.ttl.mockResolvedValue(30);

      await expect(service.generateAndSendCode(email, purpose)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('validateCode', () => {
    it('Should validate correct code', async () => {
      const email = 'test@example.com';
      const code = '123456';
      const purpose: 'signup' | 'reset' | 'update' = 'signup';

      redisMock.get.mockResolvedValue(code);

      const result = await service.validateCode(email, code, purpose);

      expect(result).toBe(true);
      expect(redisMock.get).toHaveBeenCalledWith(
        `verification:${purpose}:${email}`,
      );
    });

    it('Should throw BadRequestException if code is invalid', async () => {
      const email = 'test@example.com';
      const code = '123456';
      const purpose: 'signup' | 'reset' | 'update' = 'signup';

      redisMock.get.mockResolvedValue('654321');

      await expect(service.validateCode(email, code, purpose)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('Should throw BadRequestException if code expired', async () => {
      const email = 'test@example.com';
      const code = '123456';
      const purpose: 'signup' | 'reset' | 'update' = 'signup';

      redisMock.get.mockResolvedValue(null);

      await expect(service.validateCode(email, code, purpose)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('forceResetPassword', () => {
    it('Should reset password by admin', async () => {
      const userId = 'user-id';
      const newPassword = 'NewPassword123!';

      userService.getUserById.mockResolvedValue({
        ...mockUser,
        email: 'test@example.com',
      } as any);
      userService.resetPasswordByEmail.mockResolvedValue(undefined);

      const result = await service.forceResetPassword(userId, newPassword);

      expect(result).toEqual({
        message: 'password updated successfully by admin',
      });
      expect(userService.getUserById).toHaveBeenCalledWith(userId);
      expect(userService.resetPasswordByEmail).toHaveBeenCalledWith(
        'test@example.com',
        newPassword,
      );
    });
  });

  describe('logout', () => {
    it('Should add token to blacklist', async () => {
      const token = 'jwt_token';
      const now = Math.floor(Date.now() / 1000);

      jwtService.decode.mockReturnValue({
        exp: now + 3600,
      });
      redisMock.set.mockResolvedValue('OK');

      await service.logout(token);

      expect(jwtService.decode).toHaveBeenCalledWith(token);
      expect(redisMock.set).toHaveBeenCalledWith(
        `blacklist:${token}`,
        '1',
        'EX',
        expect.any(Number),
      );
    });

    it('Should handle invalid token gracefully', async () => {
      const token = 'invalid_token';

      jwtService.decode.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.logout(token)).resolves.not.toThrow();
    });
  });

  describe('isTokenBlacklisted', () => {
    it('Should return true if token is blacklisted', async () => {
      const token = 'jwt_token';

      redisMock.get.mockResolvedValue('1');

      const result = await service.isTokenBlacklisted(token);

      expect(result).toBe(true);
      expect(redisMock.get).toHaveBeenCalledWith(`blacklist:${token}`);
    });

    it('Should return false if token is not blacklisted', async () => {
      const token = 'jwt_token';

      redisMock.get.mockResolvedValue(null);

      const result = await service.isTokenBlacklisted(token);

      expect(result).toBe(false);
    });
  });

  describe('socialLogin', () => {
    it('Should return user JWT if user already exists by firebase uid', async () => {
      const firebaseToken = 'firebase_token';
      const mockFirebaseUser = {
        uid: 'firebase-uid-123',
        email: 'test@example.com',
        name: 'Test User',
        firebase: { sign_in_provider: 'google.com' },
      };

      getFirebaseAuth.mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockFirebaseUser),
      });

      userService.findByFirebaseUid.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue('jwt_token');
      process.env.EXPIRE_IN = '7200';

      const result = await service.socialLogin(firebaseToken);

      expect(result).toEqual({
        expiresIn: 7200,
        token: 'jwt_token',
        userId: mockUser.id,
        name: mockUser.name,
        userType: mockUser.userType,
      });
    });

    it('Should link and return JWT if user exists by email', async () => {
      const firebaseToken = 'firebase_token';
      const mockFirebaseUser = {
        uid: 'firebase-uid-123',
        email: 'test@example.com',
        name: 'Test User',
        firebase: { sign_in_provider: 'google.com' },
      };

      getFirebaseAuth.mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockFirebaseUser),
      });

      userService.findByFirebaseUid.mockResolvedValue(null);
      userService.findByEmail.mockResolvedValue(mockUser);
      userService.linkFirebaseUid.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValue('jwt_token');
      process.env.EXPIRE_IN = '7200';

      const result = await service.socialLogin(firebaseToken);

      expect(result).toEqual({
        expiresIn: 7200,
        token: 'jwt_token',
        userId: mockUser.id,
        name: mockUser.name,
        userType: mockUser.userType,
      });
      expect(userService.linkFirebaseUid).toHaveBeenCalledWith(
        mockUser.id,
        mockFirebaseUser.uid,
        mockFirebaseUser.firebase.sign_in_provider,
      );
    });

    it('Should create new user if not found', async () => {
      const firebaseToken = 'firebase_token';
      const mockFirebaseUser = {
        uid: 'firebase-uid-123',
        email: 'newuser@example.com',
        name: 'New User',
        firebase: { sign_in_provider: 'google.com' },
      };

      getFirebaseAuth.mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockFirebaseUser),
      });

      userService.findByFirebaseUid.mockResolvedValue(null);
      userService.findByEmail.mockResolvedValue(null);
      const newUser = { ...mockUser, email: mockFirebaseUser.email } as any;
      userService.createUser.mockResolvedValue(newUser);
      userService.linkFirebaseUid.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValue('jwt_token');
      process.env.EXPIRE_IN = '7200';

      const result = await service.socialLogin(firebaseToken);

      expect(result).toBeDefined();
      expect(userService.createUser).toHaveBeenCalledWith({
        email: mockFirebaseUser.email,
        name: mockFirebaseUser.name,
        password: expect.any(String),
        phone: '0000000000',
        dateOfBirth: '01/01/2000',
      });
    });

    it('Should throw UnauthorizedException if firebase token is invalid', async () => {
      const firebaseToken = 'invalid_token';

      getFirebaseAuth.mockReturnValue({
        verifyIdToken: jest.fn().mockRejectedValue(new Error('Invalid token')),
      });

      await expect(service.socialLogin(firebaseToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('Should use email-based uid if name not provided', async () => {
      const firebaseToken = 'firebase_token';
      const mockFirebaseUser = {
        uid: 'firebase-uid-456',
        email: 'user@example.com',
        name: undefined,
        firebase: { sign_in_provider: 'facebook.com' },
      };

      getFirebaseAuth.mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockFirebaseUser),
      });

      userService.findByFirebaseUid.mockResolvedValue(null);
      userService.findByEmail.mockResolvedValue(null);
      const newUser = { ...mockUser, email: mockFirebaseUser.email } as any;
      userService.createUser.mockResolvedValue(newUser);
      userService.linkFirebaseUid.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValue('jwt_token');
      process.env.EXPIRE_IN = '7200';

      const result = await service.socialLogin(firebaseToken);

      expect(result).toBeDefined();
      expect(userService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'user',
        }),
      );
    });

    it('Should use default name if both name and email are undefined', async () => {
      const firebaseToken = 'firebase_token';
      const mockFirebaseUser = {
        uid: 'firebase-uid-789',
        email: undefined,
        name: undefined,
        firebase: { sign_in_provider: 'unknown' },
      };

      getFirebaseAuth.mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockFirebaseUser),
      });

      userService.findByFirebaseUid.mockResolvedValue(null);
      userService.findByEmail.mockResolvedValue(null);
      const newUser = {
        ...mockUser,
        email: 'firebase-uid-789@social.fotouai.com.br',
      } as any;
      userService.createUser.mockResolvedValue(newUser);
      userService.linkFirebaseUid.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValue('jwt_token');
      process.env.EXPIRE_IN = '7200';

      const result = await service.socialLogin(firebaseToken);

      expect(result).toBeDefined();
      expect(userService.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Usuário',
          email: 'firebase-uid-789@social.fotouai.com.br',
        }),
      );
    });

    it('Should use unknown as provider if firebase sign_in_provider not provided', async () => {
      const firebaseToken = 'firebase_token';
      const mockFirebaseUser = {
        uid: 'firebase-uid-999',
        email: 'test@example.com',
        name: 'Test User',
        firebase: {},
      };

      getFirebaseAuth.mockReturnValue({
        verifyIdToken: jest.fn().mockResolvedValue(mockFirebaseUser),
      });

      userService.findByFirebaseUid.mockResolvedValue(null);
      userService.findByEmail.mockResolvedValue(null);
      const newUser = { ...mockUser, email: mockFirebaseUser.email } as any;
      userService.createUser.mockResolvedValue(newUser);
      userService.linkFirebaseUid.mockResolvedValue(undefined);
      jwtService.sign.mockReturnValue('jwt_token');
      process.env.EXPIRE_IN = '7200';

      const result = await service.socialLogin(firebaseToken);

      expect(result).toBeDefined();
      expect(userService.linkFirebaseUid).toHaveBeenCalledWith(
        expect.any(String),
        'firebase-uid-999',
        'unknown',
      );
    });

    it('Should handle logout when token has no expiry', async () => {
      const token = 'jwt_token_no_exp';

      jwtService.decode.mockReturnValue({
        sub: 'user-123',
      });

      await expect(service.logout(token)).resolves.not.toThrow();
    });

    it('Should not add token to blacklist if ttl is not positive', async () => {
      const token = 'jwt_token';
      const now = Math.floor(Date.now() / 1000);

      jwtService.decode.mockReturnValue({
        exp: now - 3600,
      });

      await service.logout(token);

      expect(redisMock.set).not.toHaveBeenCalled();
    });
  });
});

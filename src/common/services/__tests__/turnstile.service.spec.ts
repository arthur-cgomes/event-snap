import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TurnstileService } from '../turnstile.service';

describe('TurnstileService', () => {
  let service: TurnstileService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    configService = {
      get: jest.fn().mockReturnValue('secret-key'),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TurnstileService,
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<TurnstileService>(TurnstileService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete (global as any).fetch;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verify', () => {
    it('Should return true when secret key not configured', async () => {
      const configServiceNoKey = {
        get: jest.fn().mockReturnValue(undefined),
      } as any;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TurnstileService,
          {
            provide: ConfigService,
            useValue: configServiceNoKey,
          },
        ],
      }).compile();

      const serviceNoKey = module.get<TurnstileService>(TurnstileService);

      const result = await serviceNoKey.verify('token');

      expect(result).toBe(true);
    });

    it('Should verify token successfully when success is true', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({ success: true }),
      }) as any;

      const result = await service.verify('valid-token');

      expect(result).toBe(true);
    });

    it('Should return false when verification fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: jest.fn().mockResolvedValue({
          success: false,
          'error-codes': ['invalid-token'],
        }),
      }) as any;

      const result = await service.verify('invalid-token');

      expect(result).toBe(false);
    });

    it('Should return false on network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await service.verify('token');

      expect(result).toBe(false);
    });

    it('Should return false on non-Error exception', async () => {
      global.fetch = jest.fn().mockRejectedValue('string error');

      const result = await service.verify('token');

      expect(result).toBe(false);
    });
  });
});

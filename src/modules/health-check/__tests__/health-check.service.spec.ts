import { Test, TestingModule } from '@nestjs/testing';
import { getEntityManagerToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { Redis } from 'ioredis';
import { HealthCheckService } from '../health-check.service';

describe('HealthCheckService', () => {
  let service: HealthCheckService;
  let entityManager: jest.Mocked<EntityManager>;
  let redis: jest.Mocked<Redis>;

  beforeEach(async () => {
    entityManager = {
      query: jest.fn(),
    } as any;

    redis = {
      ping: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthCheckService,
        {
          provide: getEntityManagerToken(),
          useValue: entityManager,
        },
        {
          provide: 'REDIS',
          useValue: redis,
        },
      ],
    }).compile();

    service = module.get<HealthCheckService>(HealthCheckService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute', () => {
    it('Should return healthy status when all checks pass', async () => {
      entityManager.query.mockResolvedValue([]);
      redis.ping.mockResolvedValue('PONG');

      const result = await service.execute();

      expect(result.status).toBe('healthy');
      expect(result.version).toBeDefined();
      expect(result.uptime).toBeGreaterThan(0);
      expect(result.timestamp).toBeGreaterThan(0);
      expect(result.checks.length).toBe(2);
      expect(result.checks[0].name).toBe('Database');
      expect(result.checks[0].status).toBe(true);
      expect(result.checks[1].name).toBe('Redis');
      expect(result.checks[1].status).toBe(true);
    });

    it('Should return degraded status when database check fails', async () => {
      entityManager.query.mockRejectedValue(new Error('Connection failed'));
      redis.ping.mockResolvedValue('PONG');

      const result = await service.execute();

      expect(result.status).toBe('degraded');
      expect(result.checks.find((c) => c.name === 'Database')?.status).toBe(
        false,
      );
      expect(result.checks.find((c) => c.name === 'Redis')?.status).toBe(true);
    });

    it('Should return degraded status when redis check fails', async () => {
      entityManager.query.mockResolvedValue([]);
      redis.ping.mockRejectedValue(new Error('Connection refused'));

      const result = await service.execute();

      expect(result.status).toBe('degraded');
      expect(result.checks.find((c) => c.name === 'Database')?.status).toBe(
        true,
      );
      expect(result.checks.find((c) => c.name === 'Redis')?.status).toBe(false);
    });

    it('Should return degraded status when both checks fail', async () => {
      entityManager.query.mockRejectedValue(new Error('DB error'));
      redis.ping.mockRejectedValue(new Error('Redis error'));

      const result = await service.execute();

      expect(result.status).toBe('degraded');
      expect(result.checks.every((c) => c.status === false)).toBe(true);
    });

    it('Should include error details when checks fail', async () => {
      const dbError = new Error('Database connection failed');
      entityManager.query.mockRejectedValue(dbError);
      redis.ping.mockResolvedValue('PONG');

      const result = await service.execute();

      const dbCheck = result.checks.find((c) => c.name === 'Database');
      expect(dbCheck?.details).toContain('Database connection failed');
    });

    it('Should handle non-Error exceptions', async () => {
      entityManager.query.mockRejectedValue('Unknown error');
      redis.ping.mockResolvedValue('PONG');

      const result = await service.execute();

      const dbCheck = result.checks.find((c) => c.name === 'Database');
      expect(dbCheck?.details).toBe('Failed to connect');
    });

    it('Should verify redis response is PONG', async () => {
      entityManager.query.mockResolvedValue([]);
      redis.ping.mockResolvedValue('PONG');

      const result = await service.execute();

      const redisCheck = result.checks.find((c) => c.name === 'Redis');
      expect(redisCheck?.status).toBe(true);
      expect(redisCheck?.details).toBe('PONG');
    });

    it('Should return degraded when redis does not respond with PONG', async () => {
      entityManager.query.mockResolvedValue([]);
      redis.ping.mockResolvedValue('OTHER_RESPONSE');

      const result = await service.execute();

      const redisCheck = result.checks.find((c) => c.name === 'Redis');
      expect(redisCheck?.status).toBe(false);
    });

    it('Should handle non-Error exceptions from Redis', async () => {
      entityManager.query.mockResolvedValue([]);
      redis.ping.mockRejectedValue('Unknown redis error');

      const result = await service.execute();

      const redisCheck = result.checks.find((c) => c.name === 'Redis');
      expect(redisCheck?.details).toBe('Failed to connect');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { CacheService } from '../services/cache.service';
import { Redis } from 'ioredis';

describe('CacheService', () => {
  let service: CacheService;
  let redisMock: jest.Mocked<Redis>;

  beforeEach(async () => {
    redisMock = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      keys: jest.fn(),
      exists: jest.fn(),
      ttl: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: 'REDIS',
          useValue: redisMock,
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should return parsed value from cache', async () => {
      const testData = { id: '123', name: 'Test' };
      redisMock.get.mockResolvedValue(JSON.stringify(testData));

      const result = await service.get('test-key');

      expect(result).toEqual(testData);
      expect(redisMock.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null if key does not exist', async () => {
      redisMock.get.mockResolvedValue(null);

      const result = await service.get('non-existent-key');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      redisMock.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.get('error-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value without TTL', async () => {
      const testData = { id: '123' };
      redisMock.set.mockResolvedValue('OK');

      await service.set('test-key', testData);

      expect(redisMock.set).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify(testData),
      );
    });

    it('should set value with TTL', async () => {
      const testData = { id: '123' };
      redisMock.set.mockResolvedValue('OK');

      await service.set('test-key', testData, 3600);

      expect(redisMock.set).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify(testData),
        'EX',
        3600,
      );
    });

    it('should handle errors gracefully', async () => {
      redisMock.set.mockRejectedValue(new Error('Redis error'));

      await expect(
        service.set('test-key', { id: '123' }),
      ).resolves.not.toThrow();
    });
  });

  describe('del', () => {
    it('should delete key', async () => {
      redisMock.del.mockResolvedValue(1);

      await service.del('test-key');

      expect(redisMock.del).toHaveBeenCalledWith('test-key');
    });

    it('should handle errors gracefully', async () => {
      redisMock.del.mockRejectedValue(new Error('Redis error'));

      await expect(service.del('test-key')).resolves.not.toThrow();
    });
  });

  describe('delByPattern', () => {
    it('should delete keys matching pattern', async () => {
      redisMock.keys.mockResolvedValue(['key1', 'key2', 'key3']);
      redisMock.del.mockResolvedValue(3);

      await service.delByPattern('test:*');

      expect(redisMock.keys).toHaveBeenCalledWith('test:*');
      expect(redisMock.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
    });

    it('should not call del if no keys match', async () => {
      redisMock.keys.mockResolvedValue([]);

      await service.delByPattern('test:*');

      expect(redisMock.keys).toHaveBeenCalledWith('test:*');
      expect(redisMock.del).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      redisMock.keys.mockRejectedValue(new Error('Redis error'));

      await expect(service.delByPattern('test:*')).resolves.not.toThrow();
    });
  });

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      const testData = { id: '123' };
      redisMock.get.mockResolvedValue(JSON.stringify(testData));

      const factory = jest.fn();
      const result = await service.getOrSet('test-key', factory);

      expect(result).toEqual(testData);
      expect(factory).not.toHaveBeenCalled();
    });

    it('should call factory and cache result if not cached', async () => {
      const testData = { id: '123' };
      redisMock.get.mockResolvedValue(null);
      redisMock.set.mockResolvedValue('OK');

      const factory = jest.fn().mockResolvedValue(testData);
      const result = await service.getOrSet('test-key', factory, 3600);

      expect(result).toEqual(testData);
      expect(factory).toHaveBeenCalled();
      expect(redisMock.set).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify(testData),
        'EX',
        3600,
      );
    });
  });

  describe('exists', () => {
    it('should return true if key exists', async () => {
      redisMock.exists.mockResolvedValue(1);

      const result = await service.exists('test-key');

      expect(result).toBe(true);
      expect(redisMock.exists).toHaveBeenCalledWith('test-key');
    });

    it('should return false if key does not exist', async () => {
      redisMock.exists.mockResolvedValue(0);

      const result = await service.exists('test-key');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      redisMock.exists.mockRejectedValue(new Error('Redis error'));

      const result = await service.exists('test-key');

      expect(result).toBe(false);
    });
  });

  describe('ttl', () => {
    it('should return TTL of key', async () => {
      redisMock.ttl.mockResolvedValue(3600);

      const result = await service.ttl('test-key');

      expect(result).toBe(3600);
      expect(redisMock.ttl).toHaveBeenCalledWith('test-key');
    });

    it('should return -1 on error', async () => {
      redisMock.ttl.mockRejectedValue(new Error('Redis error'));

      const result = await service.ttl('test-key');

      expect(result).toBe(-1);
    });
  });

  describe('increment', () => {
    it('should increment counter', async () => {
      redisMock.incr.mockResolvedValue(5);

      const result = await service.increment('counter-key');

      expect(result).toBe(5);
      expect(redisMock.incr).toHaveBeenCalledWith('counter-key');
    });

    it('should set TTL on first increment', async () => {
      redisMock.incr.mockResolvedValue(1);
      redisMock.expire.mockResolvedValue(1);

      const result = await service.increment('counter-key', 3600);

      expect(result).toBe(1);
      expect(redisMock.incr).toHaveBeenCalledWith('counter-key');
      expect(redisMock.expire).toHaveBeenCalledWith('counter-key', 3600);
    });

    it('should not set TTL on subsequent increments', async () => {
      redisMock.incr.mockResolvedValue(2);

      const result = await service.increment('counter-key', 3600);

      expect(result).toBe(2);
      expect(redisMock.expire).not.toHaveBeenCalled();
    });

    it('should return 0 on error', async () => {
      redisMock.incr.mockRejectedValue(new Error('Redis error'));

      const result = await service.increment('counter-key');

      expect(result).toBe(0);
    });
  });
});

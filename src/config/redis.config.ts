import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import IORedis from 'ioredis';
config();

const configService = new ConfigService();

const redis = new IORedis({
  host: configService.get('REDIS_HOST'),
  port: Number(configService.get('REDIS_PORT')),
  password: configService.get('REDIS_PASSWORD') || undefined,
  db: Number(configService.get('REDIS_DB') || 0),
});

export const RedisProvider = {
  provide: 'REDIS',
  useValue: redis,
};

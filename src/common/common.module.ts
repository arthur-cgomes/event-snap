import { Global, Module } from '@nestjs/common';
import { CacheService } from './services/cache.service';
import { RedisProvider } from '../config/redis.config';

@Global()
@Module({
  providers: [RedisProvider, CacheService],
  exports: [CacheService],
})
export class CommonModule {}

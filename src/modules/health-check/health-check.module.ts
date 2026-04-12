import { Module } from '@nestjs/common';
import { HealthCheckService } from './health-check.service';
import { HealthCheckController } from './health-check.controller';
import { RedisProvider } from '../../common/config/redis.config';

@Module({
  providers: [HealthCheckService, RedisProvider],
  controllers: [HealthCheckController],
  exports: [HealthCheckService],
})
export class HealthCheckModule {}

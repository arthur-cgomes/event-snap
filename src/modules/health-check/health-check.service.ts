import { Inject, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { Redis } from 'ioredis';
import { version } from '../../../package.json';

export interface HealthCheckResponse {
  status: string;
  version: string;
  uptime: number;
  timestamp: number;
  checks: {
    name: string;
    type: string;
    status: boolean;
    details?: string;
  }[];
}

@Injectable()
export class HealthCheckService {
  constructor(
    @InjectEntityManager() private readonly entityManager: EntityManager,
    @Inject('REDIS') private readonly redis: Redis,
  ) {}

  async execute(): Promise<HealthCheckResponse> {
    const checks = await Promise.all([this.checkDatabase(), this.checkRedis()]);

    const allHealthy = checks.every((c) => c.status);

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      version,
      uptime: process.uptime(),
      timestamp: Date.now(),
      checks,
    };
  }

  private async checkDatabase() {
    try {
      await this.entityManager.query('SELECT 1');
      return {
        name: 'Database',
        type: 'postgres',
        status: true,
        details: 'Connected',
      };
    } catch (error) {
      return {
        name: 'Database',
        type: 'postgres',
        status: false,
        details: error instanceof Error ? error.message : 'Failed to connect',
      };
    }
  }

  private async checkRedis() {
    try {
      const pong = await this.redis.ping();
      return {
        name: 'Redis',
        type: 'cache',
        status: pong === 'PONG',
        details: pong,
      };
    } catch (error) {
      return {
        name: 'Redis',
        type: 'cache',
        status: false,
        details: error instanceof Error ? error.message : 'Failed to connect',
      };
    }
  }
}

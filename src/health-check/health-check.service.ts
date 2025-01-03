import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

export interface HealthCheckResponse {
  uptime: number;
  message: string;
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
  ) {}

  async execute(): Promise<HealthCheckResponse> {
    let databaseStatus = false;
    let databaseMessage = 'Disconnected';

    try {
      await this.entityManager.query('SELECT 1');
      databaseStatus = true;
      databaseMessage = 'Connected';
    } catch (error) {
      if (error instanceof Error) {
        databaseMessage = error.message;
      } else {
        databaseMessage = 'Failed to connect';
      }
    }

    return {
      uptime: process.uptime(),
      message: databaseStatus ? 'OK' : 'ERROR',
      timestamp: Date.now(),
      checks: [
        {
          name: 'Database',
          type: 'internal',
          status: databaseStatus,
          details: databaseMessage,
        },
      ],
    };
  }
}

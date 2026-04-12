import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckResponse,
  HealthCheckService,
} from './health-check.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Health Check')
@Controller('health-check')
export class HealthCheckController {
  constructor(private readonly healthCheckService: HealthCheckService) {}

  @Get()
  @ApiOperation({
    summary: 'Retorna o status da aplicação',
  })
  async check(): Promise<HealthCheckResponse> {
    return await this.healthCheckService.execute();
  }
}

import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CacheService } from '../services/cache.service';

@Injectable()
export class CustomRateLimitGuard extends ThrottlerGuard {
  constructor(private readonly cacheService: CacheService) {
    super({
      throttlers: [
        {
          ttl: 60000, // 1 minute window
          limit: 10, // 10 requests per minute per IP
        },
      ],
    });
  }

  async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.connection.remoteAddress;
    const key = `rate-limit:upload:${ip}`;

    // Get current count
    const count = await this.cacheService.increment(key, ttl / 1000);

    if (count > limit) {
      return false;
    }

    return true;
  }
}

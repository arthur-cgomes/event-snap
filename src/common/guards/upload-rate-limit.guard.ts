import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CacheService } from '../services/cache.service';

/**
 * Per-IP rate limiter for uploads.
 * Limits each IP to a maximum number of uploads within a sliding window.
 * Works alongside the global ThrottlerGuard for defense in depth.
 */
@Injectable()
export class UploadRateLimitGuard implements CanActivate {
  private readonly MAX_UPLOADS_PER_WINDOW = 30;
  private readonly WINDOW_SECONDS = 300; // 5 minutes

  constructor(private readonly cacheService: CacheService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip =
      request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      request.ip ||
      'unknown';

    const key = `upload_rate:${ip}`;

    const currentCount = await this.cacheService.get<number>(key);

    if (currentCount !== null && currentCount >= this.MAX_UPLOADS_PER_WINDOW) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Limite de ${this.MAX_UPLOADS_PER_WINDOW} uploads a cada ${this.WINDOW_SECONDS / 60} minutos. Tente novamente mais tarde.`,
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const newCount = (currentCount || 0) + 1;
    await this.cacheService.set(key, newCount, this.WINDOW_SECONDS);

    return true;
  }
}

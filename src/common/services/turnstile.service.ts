import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TurnstileVerifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);
  private readonly secretKey: string;

  constructor(private readonly configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('TURNSTILE_SECRET_KEY') || '';
  }

  async verify(token: string): Promise<boolean> {
    if (!this.secretKey) {
      this.logger.warn(
        'TURNSTILE_SECRET_KEY not configured, skipping verification',
      );
      return true;
    }

    try {
      const response = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            secret: this.secretKey,
            response: token,
          }),
        },
      );

      const data: TurnstileVerifyResponse = await response.json();

      if (!data.success) {
        this.logger.warn(
          `Turnstile verification failed: ${JSON.stringify(data['error-codes'])}`,
        );
      }

      return data.success;
    } catch (error: unknown) {
      this.logger.error(
        `Turnstile verification error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }
}

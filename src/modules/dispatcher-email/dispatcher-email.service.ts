import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DispatcherEmailService {
  private readonly logger = new Logger(DispatcherEmailService.name);
  private readonly dispatcherUrl: string;
  private readonly senderEmail: string;

  constructor(private readonly configService: ConfigService) {
    this.dispatcherUrl =
      this.configService.get<string>('DISPATCHER_EMAIL_URL') ||
      'http://dispatcher-email:3000';
    this.senderEmail =
      this.configService.get<string>('DISPATCHER_FROM_EMAIL') ||
      'noreply@fotouai.com.br';
  }

  async sendEmail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<{ message: string }> {
    const url = `${this.dispatcherUrl}/send/brevo`;
    const body = JSON.stringify({
      to,
      from: this.senderEmail,
      subject,
      body: html || text,
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMsg =
          errorData.error || `Dispatcher responded with ${response.status}`;
        this.logger.error(`Dispatcher error: ${errorMsg}`);
        throw new InternalServerErrorException(
          `Email dispatch failed: ${errorMsg}`,
        );
      }

      const data = await response.json();
      this.logger.log(`Email dispatched to: ${to}`);
      return data;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Dispatcher request failed: ${errorMessage}`);
      throw new InternalServerErrorException(
        `Email dispatch failed: ${errorMessage}`,
      );
    }
  }
}

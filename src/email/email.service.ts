import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = new Resend(apiKey);
  }

  async sendEmail(to: string, subject: string, text: string, html?: string) {
    const fromEmail = this.configService.get<string>('RESEND_FROM_EMAIL');

    try {
      const { data, error } = await this.resend.emails.send({
        from: fromEmail,
        to,
        subject,
        text,
        html: html || text,
      });

      if (error) {
        this.logger.error('Resend API Error:', error);
        throw new InternalServerErrorException(
          `Email sending failed: ${error.message}`,
        );
      }

      this.logger.log(`Email sent to: ${to} | ID: ${data?.id}`);
      return data;
    } catch (error) {
      this.logger.error('Unexpected error sending email:', error);
      throw error;
    }
  }
}

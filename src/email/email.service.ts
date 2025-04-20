import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('SENDGRID_API_KEY');
    sgMail.setApiKey(apiKey);
  }

  async sendEmail(to: string, subject: string, text: string, html?: string) {
    const fromEmail = this.configService.get<string>('SENDGRID_FROM_EMAIL');

    const msg = {
      to,
      from: fromEmail,
      subject,
      text,
      html: html || text,
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`email sent to: ${to}`);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as any).response === 'object'
      ) {
        this.logger.error('error sending email:', (error as any).response.body);
      } else {
        this.logger.error('error sending email:', error);
      }

      throw error;
    }
  }
}

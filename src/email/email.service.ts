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

  async sendBrevo(to: string, subject: string, text: string, html?: string) {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    const senderEmail = this.configService.get<string>('BREVO_SENDER_EMAIL');
    const senderName =
      this.configService.get<string>('BREVO_SENDER_NAME') || 'MVP App';

    const url = 'https://api.brevo.com/v3/smtp/email';

    const body = {
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [
        {
          email: to,
        },
      ],
      subject: subject,
      htmlContent: html || text,
      textContent: text,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(JSON.stringify(errorData));
      }

      const data = await response.json();
      this.logger.log(`Brevo email sent to: ${to} | ID: ${data.messageId}`);
      return data;
    } catch (error) {
      this.logger.error('Error sending via Brevo API:', error);
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error);
      throw new InternalServerErrorException(
        `Brevo sending failed: ${errorMessage}`,
      );
    }
  }
}

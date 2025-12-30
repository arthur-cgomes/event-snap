import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;
  private gmailTransporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = new Resend(apiKey);

    this.gmailTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: this.configService.get<string>('GMAIL_USER'),
        pass: this.configService.get<string>('GMAIL_PASS'),
      },
      tls: {
        ciphers: 'SSLv3',
      },
    });
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

  async sendGmail(to: string, subject: string, text: string, html?: string) {
    console.log('Sending email via Gmail to:', to);
    const gmailUser = this.configService.get<string>('GMAIL_USER');

    try {
      const info = await this.gmailTransporter.sendMail({
        from: `"MVP App" <${gmailUser}>`,
        to,
        subject,
        text,
        html: html || text,
      });

      this.logger.log(`Gmail sent to: ${to} | ID: ${info.messageId}`);
      return info;
    } catch (error) {
      this.logger.error('Error sending via Gmail:', error);
      throw new InternalServerErrorException(
        `Gmail sending failed: ${(error as Error).message}`,
      );
    }
  }
}

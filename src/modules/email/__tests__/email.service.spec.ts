import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from '../email.service';

const mockResendSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: {
      send: mockResendSend,
    },
  })),
}));

describe('EmailService', () => {
  let service: EmailService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config = {
          RESEND_API_KEY: 'resend-api-key',
          RESEND_FROM_EMAIL: 'from@example.com',
          BREVO_API_KEY: 'api-key',
          BREVO_SENDER_EMAIL: 'sender@example.com',
          BREVO_SENDER_NAME: 'Sender Name',
        };
        return config[key];
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
  });

  afterEach(() => {
    mockResendSend.mockReset();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resend getter - missing key', () => {
    it('Should throw InternalServerErrorException when RESEND_API_KEY is not configured', async () => {
      configService.get = jest.fn().mockReturnValue(undefined);

      await expect(
        service.sendEmail('to@example.com', 'Subject', 'Text'),
      ).rejects.toThrow('RESEND_API_KEY not configured');
    });
  });

  describe('sendEmail', () => {
    it('Should send email via Resend successfully', async () => {
      mockResendSend.mockResolvedValueOnce({
        data: { id: 'email-123' },
        error: null,
      });

      const result = await service.sendEmail(
        'test@example.com',
        'Test Subject',
        'Test Text',
        '<p>Test HTML</p>',
      );

      expect(result).toEqual({ id: 'email-123' });
    });

    it('Should use text as html fallback in sendEmail', async () => {
      mockResendSend.mockResolvedValueOnce({
        data: { id: 'email-456' },
        error: null,
      });

      await service.sendEmail('test@example.com', 'Test', 'Test Text');

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          html: 'Test Text',
        }),
      );
    });

    it('Should handle Resend API error', async () => {
      mockResendSend.mockResolvedValueOnce({
        data: null,
        error: { message: 'Invalid email' },
      });

      await expect(
        service.sendEmail('invalid-email', 'Test', 'Test Text'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('Should handle unexpected error in sendEmail', async () => {
      mockResendSend.mockRejectedValueOnce(new Error('Unexpected error'));

      await expect(
        service.sendEmail('test@example.com', 'Test', 'Test Text'),
      ).rejects.toThrow(Error);
    });
  });

  describe('sendBrevo', () => {
    beforeEach(() => {
      configService.get.mockImplementation((key: string) => {
        const config = {
          BREVO_API_KEY: 'api-key',
          BREVO_SENDER_EMAIL: 'sender@example.com',
          BREVO_SENDER_NAME: 'Sender Name',
        };
        return config[key];
      });
    });

    it('Should send email via Brevo successfully', async () => {
      const to = 'test@example.com';
      const subject = 'Test Subject';
      const text = 'Test Text';
      const html = '<p>Test HTML</p>';

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ messageId: 'brevo-msg-123' }),
      }) as any;

      const result = await service.sendBrevo(to, subject, text, html);

      expect(result).toEqual({ messageId: 'brevo-msg-123' });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/smtp/email',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'api-key': 'api-key',
          }),
        }),
      );
    });

    it('Should use text as html fallback', async () => {
      const to = 'test@example.com';
      const subject = 'Test Subject';
      const text = 'Test Text';

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ messageId: 'brevo-msg-123' }),
      }) as any;

      await service.sendBrevo(to, subject, text);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/smtp/email',
        expect.objectContaining({
          body: expect.stringContaining(text),
        }),
      );
    });

    it('Should handle Brevo API error', async () => {
      const to = 'test@example.com';
      const subject = 'Test Subject';
      const text = 'Test Text';

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({ message: 'Invalid API key' }),
      }) as any;

      await expect(service.sendBrevo(to, subject, text)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('Should handle network error', async () => {
      const to = 'test@example.com';
      const subject = 'Test Subject';
      const text = 'Test Text';

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(service.sendBrevo(to, subject, text)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('Should use default sender name if not provided', async () => {
      const to = 'test@example.com';
      const subject = 'Test Subject';
      const text = 'Test Text';

      configService.get.mockImplementation((key: string) => {
        const config = {
          BREVO_API_KEY: 'api-key',
          BREVO_SENDER_EMAIL: 'sender@example.com',
        };
        return config[key];
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ messageId: 'brevo-msg-123' }),
      }) as any;

      await service.sendBrevo(to, subject, text);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.brevo.com/v3/smtp/email',
        expect.objectContaining({
          body: expect.stringContaining('MVP App'),
        }),
      );
    });

    it('Should log error stack if available', async () => {
      const to = 'test@example.com';
      const subject = 'Test Subject';
      const text = 'Test Text';
      const error = new Error('Test error with stack');
      error.stack = 'Error: Test error\n  at ...\n  at ...';

      global.fetch = jest.fn().mockRejectedValue(error);

      await expect(service.sendBrevo(to, subject, text)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('Should handle non-Error exception in sendBrevo', async () => {
      const to = 'test@example.com';
      const subject = 'Test Subject';
      const text = 'Test Text';

      global.fetch = jest.fn().mockRejectedValue('string error message');

      await expect(service.sendBrevo(to, subject, text)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});

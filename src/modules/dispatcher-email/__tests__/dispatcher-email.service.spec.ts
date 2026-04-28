import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DispatcherEmailService } from '../dispatcher-email.service';

describe('DispatcherEmailService', () => {
  let service: DispatcherEmailService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      const config: Record<string, string> = {
        DISPATCHER_EMAIL_URL: 'http://dispatcher-email:3000',
        DISPATCHER_FROM_EMAIL: 'noreply@fotouai.com.br',
      };
      return config[key];
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DispatcherEmailService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<DispatcherEmailService>(DispatcherEmailService);
  });

  afterEach(() => jest.restoreAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      const mockResponse = { message: 'Email sent successfully' };
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await service.sendEmail(
        'test@example.com',
        'Test Subject',
        'Test text',
        '<p>Test html</p>',
      );

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
        'http://dispatcher-email:3000/send/brevo',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: 'test@example.com',
            from: 'noreply@fotouai.com.br',
            subject: 'Test Subject',
            body: '<p>Test html</p>',
          }),
        },
      );
    });

    it('should use text as body when html is not provided', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ message: 'Email sent successfully' }),
      } as Response);

      await service.sendEmail('test@example.com', 'Subject', 'Plain text');

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"body":"Plain text"'),
        }),
      );
    });

    it('should throw InternalServerErrorException on non-ok response', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid email address' }),
      } as Response);

      await expect(service.sendEmail('bad', 'Subject', 'Text')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should throw with status code when error field is missing', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({}),
      } as Response);

      await expect(
        service.sendEmail('test@example.com', 'Subject', 'Text'),
      ).rejects.toThrow('Dispatcher responded with 429');
    });

    it('should throw InternalServerErrorException on fetch failure', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        service.sendEmail('test@example.com', 'Subject', 'Text'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should handle non-Error thrown by fetch', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue('string error');

      await expect(
        service.sendEmail('test@example.com', 'Subject', 'Text'),
      ).rejects.toThrow('Email dispatch failed: string error');
    });

    it('should re-throw InternalServerErrorException from non-ok response path', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Provider failed after retries' }),
      } as Response);

      await expect(
        service.sendEmail('test@example.com', 'Subject', 'Text'),
      ).rejects.toThrow('Provider failed after retries');
    });
  });

  describe('constructor defaults', () => {
    it('should use default URL and email when config is empty', async () => {
      const emptyConfig = {
        get: jest.fn(() => undefined),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DispatcherEmailService,
          { provide: ConfigService, useValue: emptyConfig },
        ],
      }).compile();

      const defaultService = module.get<DispatcherEmailService>(
        DispatcherEmailService,
      );

      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ message: 'Email sent successfully' }),
      } as Response);

      await defaultService.sendEmail('test@example.com', 'Subject', 'Text');

      expect(fetch).toHaveBeenCalledWith(
        'http://dispatcher-email:3000/send/brevo',
        expect.objectContaining({
          body: expect.stringContaining('"from":"noreply@fotouai.com.br"'),
        }),
      );
    });
  });
});

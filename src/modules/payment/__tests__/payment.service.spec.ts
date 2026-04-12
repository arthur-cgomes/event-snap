import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MockRepository,
  repositoryMockFactory,
} from '../../../common/utils/test.util';
import { CacheService } from '../../../common/services/cache.service';
import { EmailService } from '../../email/email.service';
import { PaymentService } from '../payment.service';
import { Payment } from '../entity/payment.entity';
import { QrCode } from '../../qrcode/entity/qrcode.entity';
import { PaymentStatus } from '../enum/payment-status.enum';
import { QrCodeType } from '../../../common/enum/qrcode-type.enum';

jest.mock('stripe');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Stripe = require('stripe');

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentRepository: MockRepository<Repository<Payment>>;
  let qrCodeRepository: MockRepository<Repository<QrCode>>;
  let configService: jest.Mocked<ConfigService>;
  let cacheService: jest.Mocked<CacheService>;
  let emailService: jest.Mocked<EmailService>;

  const mockUser = { id: 'user-id', email: 'test@example.com' } as any;

  const mockQrCode = {
    id: 'qr-id',
    eventName: 'Test Event',
    type: QrCodeType.FREE,
    user: mockUser,
  } as unknown as QrCode;

  const mockPayment = {
    id: 'payment-id',
    stripeSessionId: 'session-123',
    amount: 9999,
    currency: 'brl',
    status: PaymentStatus.PENDING,
    user: mockUser,
    qrCode: mockQrCode,
    createdAt: new Date(),
  } as unknown as Payment;

  beforeEach(async () => {
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config = {
          STRIPE_SECRET_KEY: 'sk_test_123',
          FRONTEND_URL: 'https://example.com',
        };
        return config[key];
      }),
    } as any;

    cacheService = {
      del: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
      delByPattern: jest.fn().mockResolvedValue(undefined),
    } as any;

    emailService = {
      sendBrevo: jest.fn().mockResolvedValue({ messageId: 'msg-123' }),
      sendEmail: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: getRepositoryToken(Payment),
          useValue: repositoryMockFactory<Payment>(),
        },
        {
          provide: getRepositoryToken(QrCode),
          useValue: repositoryMockFactory<QrCode>(),
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: CacheService,
          useValue: cacheService,
        },
        {
          provide: EmailService,
          useValue: emailService,
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    paymentRepository = module.get(getRepositoryToken(Payment));
    qrCodeRepository = module.get(getRepositoryToken(QrCode));
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createCheckoutSession', () => {
    it('Should create checkout session successfully', async () => {
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      paymentRepository.findOne = jest.fn().mockResolvedValue(null);
      paymentRepository.create = jest.fn().mockReturnValue(mockPayment);
      paymentRepository.save = jest.fn().mockResolvedValue(mockPayment);

      Stripe.prototype.checkout = {
        sessions: {
          create: jest.fn().mockResolvedValue({
            id: 'session-123',
            url: 'https://stripe.com/pay/session-123',
          }),
        },
      };

      const result = await service.createCheckoutSession('qr-id', mockUser);

      expect(result.sessionId).toBe('session-123');
      expect(result.url).toBe('https://stripe.com/pay/session-123');
      expect(qrCodeRepository.findOne).toHaveBeenCalled();
      expect(paymentRepository.save).toHaveBeenCalled();
    });

    it('Should use default event name when QR code eventName is empty', async () => {
      const qrCodeNoName = {
        ...mockQrCode,
        eventName: null,
      };
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeNoName);
      paymentRepository.findOne = jest.fn().mockResolvedValue(null);
      paymentRepository.create = jest.fn().mockReturnValue(mockPayment);
      paymentRepository.save = jest.fn().mockResolvedValue(mockPayment);

      const createMock = jest.fn().mockResolvedValue({
        id: 'session-123',
        url: 'https://stripe.com/pay/session-123',
      });
      Stripe.prototype.checkout = {
        sessions: {
          create: createMock,
        },
      };

      const result = await service.createCheckoutSession('qr-id', mockUser);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: expect.arrayContaining([
            expect.objectContaining({
              price_data: expect.objectContaining({
                product_data: expect.objectContaining({
                  name: expect.stringContaining('Evento'),
                }),
              }),
            }),
          ]),
        }),
      );
      expect(result.sessionId).toBe('session-123');
    });

    it('Should throw NotFoundException when QR code not found', async () => {
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        service.createCheckoutSession('nonexistent', mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('Should throw BadRequestException when QR code is already premium', async () => {
      const premiumQrCode = {
        ...mockQrCode,
        type: QrCodeType.PAID,
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(premiumQrCode);

      await expect(
        service.createCheckoutSession('qr-id', mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('Should throw BadRequestException when user not owner', async () => {
      const otherUserQrCode = {
        ...mockQrCode,
        user: { id: 'other-user-id' },
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(otherUserQrCode);

      await expect(
        service.createCheckoutSession('qr-id', mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleWebhook', () => {
    it('Should handle webhook signature verification failure gracefully', async () => {
      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockImplementation(() => {
          throw new Error('Signature verification failed');
        }),
      };

      await expect(
        service.handleWebhook(Buffer.from('body'), 'invalid_sig'),
      ).rejects.toThrow();
    });

    it('Should handle checkout.session.completed event', async () => {
      const sessionEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'session-123',
            payment_intent: 'pi-123',
            payment_method_types: ['card'],
          },
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(sessionEvent),
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(mockPayment);
      paymentRepository.save = jest.fn().mockResolvedValue(mockPayment);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);
      emailService.sendEmail = jest.fn().mockResolvedValue(undefined);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(paymentRepository.findOne).toHaveBeenCalled();
      expect(qrCodeRepository.findOne).toHaveBeenCalled();
    });

    it('Should handle checkout.session.expired event', async () => {
      const sessionEvent = {
        type: 'checkout.session.expired',
        data: {
          object: {
            id: 'session-456',
          },
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(sessionEvent),
      };

      paymentRepository.findOne = jest
        .fn()
        .mockResolvedValue({ ...mockPayment, status: PaymentStatus.PENDING });
      paymentRepository.save = jest.fn().mockResolvedValue(mockPayment);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(paymentRepository.findOne).toHaveBeenCalled();
      expect(paymentRepository.save).toHaveBeenCalled();
    });

    it('Should ignore unhandled event types', async () => {
      const unknownEvent = {
        type: 'unknown.event',
        data: { object: {} },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(unknownEvent),
      };

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(paymentRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('getPaymentStatus', () => {
    it('Should return payment status when payment completed', async () => {
      const completedPayment = {
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
        paidAt: new Date(),
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(completedPayment);

      const result = await service.getPaymentStatus('qr-id', mockUser);

      expect(result.isPaid).toBe(true);
      expect(result.status).toBe(PaymentStatus.COMPLETED);
      expect(result.paidAt).toBeDefined();
    });

    it('Should return false when no payment found', async () => {
      paymentRepository.findOne = jest.fn().mockResolvedValue(null);

      const result = await service.getPaymentStatus('qr-id', mockUser);

      expect(result.isPaid).toBe(false);
      expect(result.status).toBeNull();
      expect(result.paidAt).toBeNull();
    });
  });

  describe('createCheckoutSession - additional cases', () => {
    it('Should return existing session if still open', async () => {
      const freeQrCode = {
        ...mockQrCode,
        type: QrCodeType.FREE,
      };
      const openSession = {
        id: 'session-existing',
        status: 'open',
        url: 'https://stripe.com/pay/session-existing',
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(freeQrCode);
      const pendingPayment = {
        ...mockPayment,
        status: PaymentStatus.PENDING,
        stripeSessionId: 'session-existing',
      };
      paymentRepository.findOne = jest.fn().mockResolvedValue(pendingPayment);

      Stripe.prototype.checkout = {
        sessions: {
          retrieve: jest.fn().mockResolvedValue(openSession),
        },
      };

      const result = await service.createCheckoutSession('qr-id', mockUser);

      expect(result.sessionId).toBe('session-existing');
      expect(result.url).toBe('https://stripe.com/pay/session-existing');
    });

    it('Should mark failed session and create new one', async () => {
      const freeQrCode = {
        ...mockQrCode,
        type: QrCodeType.FREE,
      };
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(freeQrCode);
      const failedPayment = {
        ...mockPayment,
        status: PaymentStatus.PENDING,
        stripeSessionId: 'session-old',
      };
      paymentRepository.findOne = jest.fn().mockResolvedValue(failedPayment);
      paymentRepository.save = jest.fn().mockResolvedValue(failedPayment);
      paymentRepository.create = jest.fn().mockReturnValue(mockPayment);

      Stripe.prototype.checkout = {
        sessions: {
          retrieve: jest.fn().mockRejectedValue(new Error('Session expired')),
          create: jest.fn().mockResolvedValue({
            id: 'new-session',
            url: 'https://stripe.com/pay/new-session',
          }),
        },
      };

      const result = await service.createCheckoutSession('qr-id', mockUser);

      expect(result.sessionId).toBe('new-session');
      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.FAILED,
        }),
      );
    });

    it('Should mark session as failed if not open', async () => {
      const freeQrCode = {
        ...mockQrCode,
        type: QrCodeType.FREE,
      };
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(freeQrCode);
      const pendingPayment = {
        ...mockPayment,
        status: PaymentStatus.PENDING,
        stripeSessionId: 'session-closed',
      };
      paymentRepository.findOne = jest.fn().mockResolvedValue(pendingPayment);
      paymentRepository.save = jest.fn().mockResolvedValue(pendingPayment);
      paymentRepository.create = jest.fn().mockReturnValue(mockPayment);

      Stripe.prototype.checkout = {
        sessions: {
          retrieve: jest.fn().mockResolvedValue({
            id: 'session-closed',
            status: 'complete',
            url: null,
          }),
          create: jest.fn().mockResolvedValue({
            id: 'new-session',
            url: 'https://stripe.com/pay/new-session',
          }),
        },
      };

      const result = await service.createCheckoutSession('qr-id', mockUser);

      expect(result.sessionId).toBe('new-session');
      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.FAILED,
        }),
      );
    });
  });

  describe('handleCheckoutCompleted - additional cases', () => {
    it('Should handle payment with string payment intent', async () => {
      const completedPayment = {
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
        stripePaymentIntentId: 'pi-123',
      };

      const sessionEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'session-123',
            payment_intent: 'pi-123',
            payment_method_types: ['card'],
          },
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(sessionEvent),
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(mockPayment);
      paymentRepository.save = jest.fn().mockResolvedValue(completedPayment);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          stripePaymentIntentId: 'pi-123',
        }),
      );
    });

    it('Should handle payment with object payment intent', async () => {
      const sessionEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'session-123',
            payment_intent: { id: 'pi-456' },
            payment_method_types: ['card'],
          },
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(sessionEvent),
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(mockPayment);
      paymentRepository.save = jest.fn().mockResolvedValue(mockPayment);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          stripePaymentIntentId: 'pi-456',
        }),
      );
    });

    it('Should handle payment with null payment intent', async () => {
      const sessionEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'session-123',
            payment_intent: null,
            payment_method_types: ['card'],
          },
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(sessionEvent),
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(mockPayment);
      paymentRepository.save = jest.fn().mockResolvedValue(mockPayment);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          stripePaymentIntentId: null,
        }),
      );
    });

    it('Should send email after successful payment', async () => {
      const sessionEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'session-123',
            payment_intent: 'pi-123',
            payment_method_types: ['card'],
          },
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(sessionEvent),
      };

      const userWithEmail = { ...mockUser, name: 'Test User' };
      const paymentWithUser = { ...mockPayment, user: userWithEmail };

      paymentRepository.findOne = jest.fn().mockResolvedValue(paymentWithUser);
      paymentRepository.save = jest.fn().mockResolvedValue(paymentWithUser);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);
      emailService.sendEmail = jest.fn().mockResolvedValue(undefined);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(emailService.sendEmail).toHaveBeenCalledWith(
        userWithEmail.email,
        expect.stringContaining('Pagamento confirmado'),
        expect.anything(),
        expect.anything(),
      );
    });

    it('Should handle email sending errors gracefully', async () => {
      const sessionEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'session-123',
            payment_intent: 'pi-123',
            payment_method_types: ['card'],
          },
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(sessionEvent),
      };

      const userWithEmail = { ...mockUser, name: 'Test User' };
      const paymentWithUser = { ...mockPayment, user: userWithEmail };

      paymentRepository.findOne = jest.fn().mockResolvedValue(paymentWithUser);
      paymentRepository.save = jest.fn().mockResolvedValue(paymentWithUser);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);
      emailService.sendEmail = jest
        .fn()
        .mockRejectedValue(new Error('Email failed'));

      await expect(
        service.handleWebhook(Buffer.from('body'), 'sig'),
      ).resolves.toBeUndefined();
    });

    it('Should handle missing QR code after payment', async () => {
      const sessionEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'session-123',
            payment_intent: 'pi-123',
            payment_method_types: ['card'],
          },
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(sessionEvent),
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(mockPayment);
      paymentRepository.save = jest.fn().mockResolvedValue(mockPayment);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        service.handleWebhook(Buffer.from('body'), 'sig'),
      ).resolves.toBeUndefined();
    });

    it('Should not process if payment not found for session', async () => {
      const sessionEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'session-nonexistent',
            payment_intent: 'pi-123',
            payment_method_types: ['card'],
          },
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(sessionEvent),
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(null);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(qrCodeRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('createCheckoutSession - FRONTEND_URL fallback', () => {
    it('Should use default frontend URL when FRONTEND_URL env not set', async () => {
      configService.get = jest.fn().mockImplementation((key: string) => {
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test_123';
        return undefined;
      });

      const freeQrCode = {
        ...mockQrCode,
        type: QrCodeType.FREE,
      };

      qrCodeRepository.findOne = jest.fn().mockResolvedValue(freeQrCode);
      paymentRepository.findOne = jest.fn().mockResolvedValue(null);
      paymentRepository.create = jest.fn().mockReturnValue(mockPayment);
      paymentRepository.save = jest.fn().mockResolvedValue(mockPayment);

      const createMock = jest.fn().mockResolvedValue({
        id: 'session-123',
        url: 'https://stripe.com/pay/session-123',
      });
      Stripe.prototype.checkout = {
        sessions: {
          create: createMock,
        },
      };

      await service.createCheckoutSession('qr-id', mockUser);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: expect.stringContaining(
            'https://fotouai.up.railway.app',
          ),
          cancel_url: expect.stringContaining('https://fotouai.up.railway.app'),
        }),
      );
    });
  });

  describe('handleWebhook - non-Error signature failure', () => {
    it('Should handle non-Error thrown during constructEvent', async () => {
      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockImplementation(() => {
          throw 'plain string error';
        }),
      };

      await expect(
        service.handleWebhook(Buffer.from('body'), 'invalid_sig'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleCheckoutCompleted - branch fallbacks', () => {
    it('Should default payment method to card when payment_method_types missing', async () => {
      const sessionEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'session-123',
            payment_intent: 'pi-123',
          },
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(sessionEvent),
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(mockPayment);
      paymentRepository.save = jest.fn().mockResolvedValue(mockPayment);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethod: 'card',
        }),
      );
    });

    it('Should use fallback strings when user.name and qrCode.eventName are empty', async () => {
      const sessionEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'session-123',
            payment_intent: 'pi-123',
            payment_method_types: ['card'],
          },
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(sessionEvent),
      };

      const userNoName = { ...mockUser, name: null };
      const paymentNoName = { ...mockPayment, user: userNoName };
      const qrCodeNoEventName = { ...mockQrCode, eventName: null };

      paymentRepository.findOne = jest.fn().mockResolvedValue(paymentNoName);
      paymentRepository.save = jest.fn().mockResolvedValue(paymentNoName);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeNoEventName);
      qrCodeRepository.save = jest.fn().mockResolvedValue(qrCodeNoEventName);
      emailService.sendEmail = jest.fn().mockResolvedValue(undefined);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(emailService.sendEmail).toHaveBeenCalledWith(
        userNoName.email,
        expect.stringContaining('Pagamento confirmado'),
        expect.stringContaining('Seu Evento'),
        expect.stringContaining('Seu Evento'),
      );
    });

    it('Should handle non-Error thrown from email service', async () => {
      const sessionEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'session-123',
            payment_intent: 'pi-123',
            payment_method_types: ['card'],
          },
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(sessionEvent),
      };

      const userWithEmail = { ...mockUser, name: 'Test User' };
      const paymentWithUser = { ...mockPayment, user: userWithEmail };

      paymentRepository.findOne = jest.fn().mockResolvedValue(paymentWithUser);
      paymentRepository.save = jest.fn().mockResolvedValue(paymentWithUser);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);
      emailService.sendEmail = jest.fn().mockImplementation(() => {
        return Promise.reject('plain string email error');
      });

      await expect(
        service.handleWebhook(Buffer.from('body'), 'sig'),
      ).resolves.toBeUndefined();
    });
  });

  describe('handleCheckoutExpired - additional cases', () => {
    it('Should only update if payment is PENDING', async () => {
      const sessionEvent = {
        type: 'checkout.session.expired',
        data: {
          object: {
            id: 'session-456',
          },
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(sessionEvent),
      };

      const completedPayment = {
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
      };
      paymentRepository.findOne = jest.fn().mockResolvedValue(completedPayment);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(paymentRepository.save).not.toHaveBeenCalled();
    });
  });
});

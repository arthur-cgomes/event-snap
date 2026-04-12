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
import { QrCodePlan } from '../../../common/enum/qrcode-plan.enum';
import { APP_CONSTANTS } from '../../../common/constants';

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
          success_url: expect.stringContaining('localhost:3001'),
          cancel_url: expect.stringContaining('localhost:3001'),
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

  describe('handleChargeRefunded webhook', () => {
    it('Should handle charge.refunded webhook with string payment_intent', async () => {
      const chargeEvent = {
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_123',
            payment_intent: 'pi_refund_123',
          } as any,
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(chargeEvent),
      };

      const paymentWithQrCode = {
        ...mockPayment,
        stripePaymentIntentId: 'pi_refund_123',
      };
      paymentRepository.findOne = jest
        .fn()
        .mockResolvedValue(paymentWithQrCode);
      paymentRepository.save = jest.fn().mockResolvedValue(paymentWithQrCode);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(paymentRepository.findOne).toHaveBeenCalledWith({
        where: { stripePaymentIntentId: 'pi_refund_123' },
        relations: ['qrCode'],
      });
      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PaymentStatus.REFUNDED,
        }),
      );
    });

    it('Should handle charge.refunded webhook with object payment_intent', async () => {
      const chargeEvent = {
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_456',
            payment_intent: { id: 'pi_refund_456' } as any,
          } as any,
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(chargeEvent),
      };

      const paymentWithQrCode = {
        ...mockPayment,
        stripePaymentIntentId: 'pi_refund_456',
      };
      paymentRepository.findOne = jest
        .fn()
        .mockResolvedValue(paymentWithQrCode);
      paymentRepository.save = jest.fn().mockResolvedValue(paymentWithQrCode);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(paymentRepository.findOne).toHaveBeenCalledWith({
        where: { stripePaymentIntentId: 'pi_refund_456' },
        relations: ['qrCode'],
      });
    });

    it('Should handle charge.refunded webhook with missing payment_intent', async () => {
      const chargeEvent = {
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_789',
          } as any,
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(chargeEvent),
      };

      paymentRepository.findOne = jest.fn();
      paymentRepository.save = jest.fn();

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(paymentRepository.findOne).not.toHaveBeenCalled();
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('Should handle charge.refunded webhook when payment not found', async () => {
      const chargeEvent = {
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_999',
            payment_intent: 'pi_not_found',
          } as any,
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(chargeEvent),
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(null);
      paymentRepository.save = jest.fn();

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(paymentRepository.findOne).toHaveBeenCalledWith({
        where: { stripePaymentIntentId: 'pi_not_found' },
        relations: ['qrCode'],
      });
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('Should not update if payment already refunded', async () => {
      const chargeEvent = {
        type: 'charge.refunded',
        data: {
          object: {
            id: 'ch_already_refunded',
            payment_intent: 'pi_already_refunded',
          } as any,
        },
      };

      Stripe.prototype.webhooks = {
        constructEvent: jest.fn().mockReturnValue(chargeEvent),
      };

      const alreadyRefundedPayment = {
        ...mockPayment,
        stripePaymentIntentId: 'pi_already_refunded',
        status: PaymentStatus.REFUNDED,
      };
      paymentRepository.findOne = jest
        .fn()
        .mockResolvedValue(alreadyRefundedPayment);
      paymentRepository.save = jest.fn();

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(paymentRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getPriceAndDetailsForPlan', () => {
    it('Should return CORPORATE plan details', async () => {
      // Access private method through the service instance
      const result = (service as any).getPriceAndDetailsForPlan(
        QrCodePlan.CORPORATE,
      );

      expect(result.priceInCents).toBe(APP_CONSTANTS.CORPORATE_PRICE_CENTS);
      expect(result.description).toContain('Corporate');
      expect(result.description).toContain('ilimitados');
      expect(result.daysValid).toBe(APP_CONSTANTS.CORPORATE_EXPIRATION_DAYS);
    });

    it('Should return PARTY plan details', async () => {
      const result = (service as any).getPriceAndDetailsForPlan(
        QrCodePlan.PARTY,
      );

      expect(result.priceInCents).toBe(APP_CONSTANTS.PARTY_PRICE_CENTS);
      expect(result.description).toContain('Party');
      expect(result.daysValid).toBe(APP_CONSTANTS.PARTY_EXPIRATION_DAYS);
    });

    it('Should return default PARTY plan for unknown plan', async () => {
      const result = (service as any).getPriceAndDetailsForPlan(
        'UNKNOWN' as any,
      );

      expect(result.priceInCents).toBe(APP_CONSTANTS.PARTY_PRICE_CENTS);
      expect(result.daysValid).toBe(APP_CONSTANTS.PARTY_EXPIRATION_DAYS);
    });
  });

  describe('getPlanFromAmount', () => {
    it('Should return CORPORATE plan for corporate price', async () => {
      const result = (service as any).getPlanFromAmount(
        APP_CONSTANTS.CORPORATE_PRICE_CENTS,
      );

      expect(result).toBe(QrCodePlan.CORPORATE);
    });

    it('Should return PARTY plan for non-corporate amount', async () => {
      const result = (service as any).getPlanFromAmount(
        APP_CONSTANTS.PARTY_PRICE_CENTS,
      );

      expect(result).toBe(QrCodePlan.PARTY);
    });

    it('Should return PARTY for any other amount', async () => {
      const result = (service as any).getPlanFromAmount(5000);

      expect(result).toBe(QrCodePlan.PARTY);
    });
  });

  describe('getExpirationDaysForPlan', () => {
    it('Should return FREE plan expiration days', async () => {
      const result = (service as any).getExpirationDaysForPlan(QrCodePlan.FREE);

      expect(result).toBe(APP_CONSTANTS.QR_CODE_EXPIRATION_DAYS);
    });

    it('Should return PARTY plan expiration days', async () => {
      const result = (service as any).getExpirationDaysForPlan(
        QrCodePlan.PARTY,
      );

      expect(result).toBe(APP_CONSTANTS.PARTY_EXPIRATION_DAYS);
    });

    it('Should return CORPORATE plan expiration days', async () => {
      const result = (service as any).getExpirationDaysForPlan(
        QrCodePlan.CORPORATE,
      );

      expect(result).toBe(APP_CONSTANTS.CORPORATE_EXPIRATION_DAYS);
    });

    it('Should return default expiration days for unknown plan', async () => {
      const result = (service as any).getExpirationDaysForPlan(
        'UNKNOWN' as any,
      );

      expect(result).toBe(APP_CONSTANTS.QR_CODE_EXPIRATION_DAYS);
    });
  });

  describe('getPlanDescriptionForEmail', () => {
    it('Should return PARTY plan description for email', async () => {
      const result = (service as any).getPlanDescriptionForEmail(
        QrCodePlan.PARTY,
      );

      expect(result).toContain('FESTA');
      expect(result).toContain('100 fotos/vídeos');
      expect(result).toContain(String(APP_CONSTANTS.PARTY_EXPIRATION_DAYS));
    });

    it('Should return CORPORATE plan description for email', async () => {
      const result = (service as any).getPlanDescriptionForEmail(
        QrCodePlan.CORPORATE,
      );

      expect(result).toContain('CORPORATIVO');
      expect(result).toContain('ilimitados');
      expect(result).toContain(String(APP_CONSTANTS.CORPORATE_EXPIRATION_DAYS));
    });

    it('Should return default description for unknown plan', async () => {
      const result = (service as any).getPlanDescriptionForEmail(
        'UNKNOWN' as any,
      );

      expect(result).toContain('PREMIUM');
    });
  });

  describe('requestRefund', () => {
    it('Should throw NotFoundException when payment not found', async () => {
      paymentRepository.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        service.requestRefund('invalid-id', mockUser),
      ).rejects.toThrow(NotFoundException);

      expect(paymentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'invalid-id' },
        relations: ['qrCode', 'user'],
      });
    });

    it('Should throw BadRequestException when user is not owner', async () => {
      const paymentWithDifferentUser = {
        ...mockPayment,
        user: { id: 'other-user', email: 'other@example.com' },
      };
      paymentRepository.findOne = jest
        .fn()
        .mockResolvedValue(paymentWithDifferentUser);

      await expect(
        service.requestRefund('payment-id', mockUser),
      ).rejects.toThrow(BadRequestException);
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('Should throw BadRequestException when payment not completed', async () => {
      const pendingPayment = {
        ...mockPayment,
        status: PaymentStatus.PENDING,
      };
      paymentRepository.findOne = jest.fn().mockResolvedValue(pendingPayment);

      await expect(
        service.requestRefund('payment-id', mockUser),
      ).rejects.toThrow(BadRequestException);
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('Should throw BadRequestException when no stripePaymentIntentId', async () => {
      const paymentWithoutStripeId = {
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
        stripePaymentIntentId: null,
      };
      paymentRepository.findOne = jest
        .fn()
        .mockResolvedValue(paymentWithoutStripeId);

      await expect(
        service.requestRefund('payment-id', mockUser),
      ).rejects.toThrow(BadRequestException);
      expect(paymentRepository.save).not.toHaveBeenCalled();
    });

    it('Should successfully process refund with QR code revert and email', async () => {
      const paymentWithUser = {
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
        stripePaymentIntentId: 'pi_refund_test',
        user: { ...mockUser, name: 'John Doe' },
        qrCode: { ...mockQrCode, token: 'token-123' },
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(paymentWithUser);
      paymentRepository.save = jest.fn().mockResolvedValue(paymentWithUser);
      qrCodeRepository.findOne = jest
        .fn()
        .mockResolvedValue(paymentWithUser.qrCode);
      qrCodeRepository.save = jest
        .fn()
        .mockResolvedValue(paymentWithUser.qrCode);

      Stripe.prototype.refunds = {
        create: jest.fn().mockResolvedValue({
          id: 'ref_123',
          status: 'succeeded',
        }),
      };

      const result = await service.requestRefund(
        'payment-id',
        mockUser,
        'Test reason',
      );

      expect(result.refundId).toBe('ref_123');
      expect(result.status).toBe('succeeded');
      expect(result.amount).toBe(mockPayment.amount);

      expect(Stripe.prototype.refunds.create).toHaveBeenCalledWith({
        payment_intent: 'pi_refund_test',
        reason: 'requested_by_customer',
        metadata: expect.objectContaining({
          paymentId: 'payment-id',
          userId: 'user-id',
          userReason: 'Test reason',
        }),
      });

      expect(paymentRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: PaymentStatus.REFUNDED }),
      );

      expect(qrCodeRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'qr-id' },
      });

      expect(qrCodeRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          type: QrCodeType.FREE,
          plan: QrCodePlan.FREE,
        }),
      );

      expect(cacheService.del).toHaveBeenCalledWith('qrcode:id:qr-id');
      expect(cacheService.del).toHaveBeenCalledWith('qrcode:token:token-123');
      expect(cacheService.delByPattern).toHaveBeenCalledWith('qrcode:user:*');

      expect(emailService.sendEmail).toHaveBeenCalled();
    });

    it('Should handle refund when email send fails', async () => {
      const paymentWithUser = {
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
        stripePaymentIntentId: 'pi_refund_test_2',
        user: { ...mockUser, name: 'Jane Doe' },
        qrCode: { ...mockQrCode, token: 'token-456' },
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(paymentWithUser);
      paymentRepository.save = jest.fn().mockResolvedValue(paymentWithUser);
      qrCodeRepository.findOne = jest
        .fn()
        .mockResolvedValue(paymentWithUser.qrCode);
      qrCodeRepository.save = jest
        .fn()
        .mockResolvedValue(paymentWithUser.qrCode);
      emailService.sendEmail = jest
        .fn()
        .mockRejectedValue(new Error('Email failed'));

      Stripe.prototype.refunds = {
        create: jest.fn().mockResolvedValue({
          id: 'ref_456',
          status: 'succeeded',
        }),
      };

      const result = await service.requestRefund('payment-id', mockUser);

      expect(result.refundId).toBe('ref_456');
      expect(paymentRepository.save).toHaveBeenCalled();
    });

    it('Should throw BadRequestException when Stripe refund fails', async () => {
      const paymentWithUser = {
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
        stripePaymentIntentId: 'pi_refund_fail',
        user: mockUser,
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(paymentWithUser);

      Stripe.prototype.refunds = {
        create: jest.fn().mockRejectedValue(new Error('Stripe API error')),
      };

      await expect(
        service.requestRefund('payment-id', mockUser),
      ).rejects.toThrow(BadRequestException);

      expect(paymentRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('buildRefundConfirmationHtml', () => {
    it('Should build refund confirmation HTML', async () => {
      const html = (service as any).buildRefundConfirmationHtml(
        'John Doe',
        '99.99',
        'My Event',
      );

      expect(html).toContain('John Doe');
      expect(html).toContain('99.99');
      expect(html).toContain('My Event');
      expect(html).toContain('Reembolso Processado');
      expect(html).toContain('FotoUai');
      expect(html).toContain('dashboard');
    });

    it('Should include frontend URL in HTML', async () => {
      configService.get = jest.fn().mockReturnValue('https://custom.com');

      const html = (service as any).buildRefundConfirmationHtml(
        'User',
        '50.00',
        'Event',
      );

      expect(html).toContain('https://custom.com');
    });
  });

  describe('getPaymentHistory', () => {
    it('Should return mapped payment history', async () => {
      const mockPaymentsData = [
        {
          id: 'payment-1',
          amount: 9999,
          currency: 'brl',
          status: PaymentStatus.COMPLETED,
          paymentMethod: 'card',
          paidAt: new Date('2025-01-01'),
          createdAt: new Date('2025-01-01'),
          qrCode: { eventName: 'Event 1', plan: QrCodePlan.PARTY },
        },
        {
          id: 'payment-2',
          amount: 19999,
          currency: 'brl',
          status: PaymentStatus.REFUNDED,
          paymentMethod: 'card',
          paidAt: new Date('2025-01-02'),
          createdAt: new Date('2025-01-02'),
          qrCode: { eventName: 'Event 2', plan: QrCodePlan.CORPORATE },
        },
      ];

      paymentRepository.find = jest.fn().mockResolvedValue(mockPaymentsData);

      const result = await service.getPaymentHistory(mockUser);

      expect(paymentRepository.find).toHaveBeenCalledWith({
        where: { user: { id: 'user-id' } },
        relations: ['qrCode'],
        order: { createdAt: 'DESC' },
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'payment-1',
        amount: 9999,
        currency: 'brl',
        status: PaymentStatus.COMPLETED,
        paymentMethod: 'card',
        paidAt: new Date('2025-01-01'),
        createdAt: new Date('2025-01-01'),
        eventName: 'Event 1',
        plan: QrCodePlan.PARTY,
      });
      expect(result[1]).toEqual({
        id: 'payment-2',
        amount: 19999,
        currency: 'brl',
        status: PaymentStatus.REFUNDED,
        paymentMethod: 'card',
        paidAt: new Date('2025-01-02'),
        createdAt: new Date('2025-01-02'),
        eventName: 'Event 2',
        plan: QrCodePlan.CORPORATE,
      });
    });

    it('Should return default event name when qrCode not present', async () => {
      const paymentWithoutQrCode = [
        {
          id: 'payment-3',
          amount: 5000,
          currency: 'brl',
          status: PaymentStatus.COMPLETED,
          paymentMethod: 'card',
          paidAt: new Date(),
          createdAt: new Date(),
          qrCode: null,
        },
      ];

      paymentRepository.find = jest
        .fn()
        .mockResolvedValue(paymentWithoutQrCode);

      const result = await service.getPaymentHistory(mockUser);

      expect(result[0].eventName).toBe('Evento');
      expect(result[0].plan).toBe('FREE');
    });

    it('Should return empty array when no payments', async () => {
      paymentRepository.find = jest.fn().mockResolvedValue([]);

      const result = await service.getPaymentHistory(mockUser);

      expect(result).toEqual([]);
    });
  });

  describe('requestRefund - email branch coverage', () => {
    it('Should use fallback strings when user.name and qrCode.eventName are empty in refund email', async () => {
      const userNoName = {
        id: 'user-id',
        email: 'test@example.com',
        name: null,
      };
      const qrCodeNoName = { id: 'qr-id', eventName: null, token: 'token-123' };
      const completedPayment = {
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
        stripePaymentIntentId: 'pi-123',
        user: userNoName,
        qrCode: qrCodeNoName,
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(completedPayment);
      paymentRepository.save = jest.fn().mockResolvedValue(completedPayment);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(qrCodeNoName);
      qrCodeRepository.save = jest.fn().mockResolvedValue(qrCodeNoName);

      Stripe.prototype.refunds = {
        create: jest
          .fn()
          .mockResolvedValue({ id: 're-1', status: 'succeeded' }),
      };
      emailService.sendEmail = jest.fn().mockResolvedValue(undefined);

      await service.requestRefund('payment-id', userNoName as any);

      expect(emailService.sendEmail).toHaveBeenCalledWith(
        userNoName.email,
        expect.stringContaining('Reembolso'),
        expect.stringContaining('Olá !'),
        expect.stringContaining('Seu Evento'),
      );
    });

    it('Should handle non-Error refund email failure', async () => {
      const userWithEmail = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test',
      };
      const completedPayment = {
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
        stripePaymentIntentId: 'pi-123',
        user: userWithEmail,
        qrCode: { ...mockQrCode, token: 'token-123' },
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(completedPayment);
      paymentRepository.save = jest.fn().mockResolvedValue(completedPayment);
      qrCodeRepository.findOne = jest
        .fn()
        .mockResolvedValue(completedPayment.qrCode);
      qrCodeRepository.save = jest
        .fn()
        .mockResolvedValue(completedPayment.qrCode);

      Stripe.prototype.refunds = {
        create: jest
          .fn()
          .mockResolvedValue({ id: 're-1', status: 'succeeded' }),
      };
      emailService.sendEmail = jest
        .fn()
        .mockRejectedValue('plain string error');

      const result = await service.requestRefund(
        'payment-id',
        userWithEmail as any,
      );
      expect(result.refundId).toBe('re-1');
    });

    it('Should handle non-Error Stripe refund failure', async () => {
      const userWithEmail = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test',
      };
      const completedPayment = {
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
        stripePaymentIntentId: 'pi-123',
        user: userWithEmail,
        qrCode: { ...mockQrCode, token: 'token-123' },
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(completedPayment);

      Stripe.prototype.refunds = {
        create: jest.fn().mockRejectedValue('plain string stripe error'),
      };

      await expect(
        service.requestRefund('payment-id', userWithEmail as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('buildPaymentConfirmationHtml - branch coverage', () => {
    it('Should use CORPORATE planLabel when CORPORATE plan is used in checkout completed', async () => {
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
      const corporatePayment = {
        ...mockPayment,
        amount: APP_CONSTANTS.CORPORATE_PRICE_CENTS,
        user: userWithEmail,
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(corporatePayment);
      paymentRepository.save = jest.fn().mockResolvedValue(corporatePayment);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);
      emailService.sendEmail = jest.fn().mockResolvedValue(undefined);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(emailService.sendEmail).toHaveBeenCalledWith(
        userWithEmail.email,
        expect.anything(),
        expect.anything(),
        expect.stringContaining('Corporativo'),
      );
    });

    it('Should use default FRONTEND_URL in buildRefundConfirmationHtml when env not set', async () => {
      configService.get = jest.fn().mockImplementation((key: string) => {
        if (key === 'STRIPE_SECRET_KEY') return 'sk_test_123';
        if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_123';
        return undefined;
      });

      const userWithEmail = {
        id: 'user-id',
        email: 'test@example.com',
        name: 'Test',
      };
      const completedPayment = {
        ...mockPayment,
        status: PaymentStatus.COMPLETED,
        stripePaymentIntentId: 'pi-123',
        user: userWithEmail,
        qrCode: { ...mockQrCode, token: 'token-123' },
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(completedPayment);
      paymentRepository.save = jest.fn().mockResolvedValue(completedPayment);
      qrCodeRepository.findOne = jest
        .fn()
        .mockResolvedValue(completedPayment.qrCode);
      qrCodeRepository.save = jest
        .fn()
        .mockResolvedValue(completedPayment.qrCode);

      Stripe.prototype.refunds = {
        create: jest
          .fn()
          .mockResolvedValue({ id: 're-1', status: 'succeeded' }),
      };
      emailService.sendEmail = jest.fn().mockResolvedValue(undefined);

      await service.requestRefund('payment-id', userWithEmail as any);

      expect(emailService.sendEmail).toHaveBeenCalledWith(
        userWithEmail.email,
        expect.anything(),
        expect.anything(),
        expect.stringContaining('localhost:3001'),
      );
    });

    it('Should use default plan arg and other plan label in buildPaymentConfirmationHtml', () => {
      const html = (service as any).buildPaymentConfirmationHtml(
        'Test',
        '99,99',
        'Test Event',
        new Date(),
      );
      expect(html).toContain('Festa');
    });

    it('Should show plan name directly when not PARTY or CORPORATE', () => {
      const html = (service as any).buildPaymentConfirmationHtml(
        'Test',
        '99,99',
        'Test Event',
        new Date(),
        'UNKNOWN_PLAN' as any,
      );
      expect(html).toContain('UNKNOWN_PLAN');
    });

    it('Should use fallback FRONTEND_URL in buildPaymentConfirmationHtml when env not set', () => {
      configService.get = jest.fn().mockReturnValue(undefined);

      const html = (service as any).buildPaymentConfirmationHtml(
        'Test',
        '99,99',
        'Test Event',
        new Date(),
        QrCodePlan.PARTY,
      );
      expect(html).toContain('localhost:3001');
    });

    it('Should call buildPaymentConfirmationHtml with default plan parameter', async () => {
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

      const userWithEmail = { ...mockUser, name: 'User' };
      const paymentWithUser = {
        ...mockPayment,
        amount: 9999,
        user: userWithEmail,
      };

      paymentRepository.findOne = jest.fn().mockResolvedValue(paymentWithUser);
      paymentRepository.save = jest.fn().mockResolvedValue(paymentWithUser);
      qrCodeRepository.findOne = jest.fn().mockResolvedValue(mockQrCode);
      qrCodeRepository.save = jest.fn().mockResolvedValue(mockQrCode);
      emailService.sendEmail = jest.fn().mockResolvedValue(undefined);

      await service.handleWebhook(Buffer.from('body'), 'sig');

      expect(emailService.sendEmail).toHaveBeenCalledWith(
        userWithEmail.email,
        expect.anything(),
        expect.anything(),
        expect.stringContaining('Festa'),
      );
    });
  });
});

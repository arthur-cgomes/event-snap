import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { Upload } from '../entity/upload.entity';
import { UploadService } from '../upload.service';
import { QrcodeService } from '../../qrcode/qrcode.service';
import { EmailService } from '../../email/email.service';
import { CacheService } from '../../../common/services/cache.service';
import { QrCodeType } from '../../../common/enum/qrcode-type.enum';
import { QrCodePlan } from '../../../common/enum/qrcode-plan.enum';

const mockSharpInstance = {
  resize: jest.fn().mockReturnThis(),
  webp: jest.fn().mockReturnThis(),
  toBuffer: jest.fn(),
};

jest.mock('sharp', () => {
  return jest.fn(() => mockSharpInstance);
});

jest.mock('../../../common/config/supabase.config', () => ({
  supabase: {
    storage: {
      from: jest.fn().mockReturnValue({
        upload: jest.fn(),
        getPublicUrl: jest.fn(),
        createSignedUrl: jest.fn(),
      }),
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { supabase } = require('../../../common/config/supabase.config');
const mockSupabaseStorage = supabase.storage;

describe('UploadService', () => {
  let service: UploadService;
  let uploadRepository: jest.Mocked<Repository<Upload>>;
  let qrcodeService: jest.Mocked<QrcodeService>;
  let emailService: jest.Mocked<EmailService>;
  let cacheService: jest.Mocked<CacheService>;

  beforeEach(async () => {
    uploadRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    } as any;

    qrcodeService = {
      getQrCodeByToken: jest.fn(),
      getQrCodeWithUser: jest.fn(),
      updateLastUploadAt: jest.fn().mockResolvedValue(undefined),
    } as any;

    emailService = {
      sendEmail: jest.fn(),
    } as any;

    cacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      delByPattern: jest.fn(),
    } as any;

    const _module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: 'UploadRepository',
          useValue: uploadRepository,
        },
        {
          provide: QrcodeService,
          useValue: qrcodeService,
        },
        {
          provide: EmailService,
          useValue: emailService,
        },
        {
          provide: CacheService,
          useValue: cacheService,
        },
      ],
    })
      .overrideProvider('UploadRepository')
      .useValue(uploadRepository)
      .compile();

    service = new UploadService(
      uploadRepository,
      qrcodeService,
      emailService,
      cacheService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadImage', () => {
    const mockQrCode = {
      id: 'qr-1',
      type: QrCodeType.PAID,
      token: 'token-123',
      uploadEnabled: true,
      storagePrefix: 'meu-evento-a1b2c3d4',
    } as any;
    const mockFile = {
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mimetype: 'image/jpeg',
      originalname: 'test.jpg',
    } as any;

    it('Should reject if uploadEnabled is false', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue({
        ...mockQrCode,
        uploadEnabled: false,
      });

      await expect(service.uploadImage('token-123', mockFile)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Should reject file if not provided', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);

      await expect(
        service.uploadImage('token-123', null as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('Should reject if QR code is FREE and limit reached', async () => {
      const freeQrCode = { ...mockQrCode, type: QrCodeType.FREE } as any;
      qrcodeService.getQrCodeByToken.mockResolvedValue(freeQrCode);
      (service as any).countUploadsByQrCodeId = jest.fn().mockResolvedValue(10);

      await expect(service.uploadImage('token-123', mockFile)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Should upload valid JPEG image and optimize', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);
      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('optimized'));

      const mockStorageFrom = {
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/test.webp' },
        }),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      uploadRepository.create.mockReturnValue({
        fileUrl: 'https://example.com/test.webp',
      } as any);
      uploadRepository.save.mockResolvedValue({ id: 'upload-1' } as any);
      cacheService.get.mockResolvedValue(null);

      const result = await service.uploadImage('token-123', mockFile);

      expect(result.id).toBe('upload-1');
      expect(mockSharpInstance.resize).toHaveBeenCalled();
      expect(mockSharpInstance.webp).toHaveBeenCalled();
      expect(cacheService.delByPattern).toHaveBeenCalled();
    });

    it('Should handle invalid file type', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);
      const invalidFile = {
        buffer: Buffer.from([0xab, 0xcd, 0xef, 0x12, 0x34, 0x56]),
        mimetype: 'application/pdf',
        originalname: 'test.pdf',
      } as any;

      await expect(
        service.uploadImage('token-123', invalidFile),
      ).rejects.toThrow(BadRequestException);
    });

    it('Should reject video upload on FREE QR code', async () => {
      const freeQrCode = { ...mockQrCode, type: QrCodeType.FREE };
      qrcodeService.getQrCodeByToken.mockResolvedValue(freeQrCode);
      (service as any).countUploadsByQrCodeId = jest.fn().mockResolvedValue(0);

      const videoFile = {
        buffer: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
        mimetype: 'video/webm',
        originalname: 'test.webm',
      } as any;

      await expect(service.uploadImage('token-123', videoFile)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Should reject video if size exceeds limit', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);

      const largeBuffer = Buffer.alloc(1000000000);
      largeBuffer[4] = 0x66;
      largeBuffer[5] = 0x74;
      largeBuffer[6] = 0x79;
      largeBuffer[7] = 0x70;

      const videoFile = {
        buffer: largeBuffer,
        mimetype: 'video/mp4',
        originalname: 'large.mp4',
      } as any;

      await expect(service.uploadImage('token-123', videoFile)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('Should handle sharp processing error gracefully', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);
      mockSharpInstance.toBuffer.mockRejectedValue(new Error('Sharp error'));

      const mockStorageFrom = {
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/test.jpg' },
        }),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      uploadRepository.create.mockReturnValue({
        fileUrl: 'https://example.com/test.jpg',
      } as any);
      uploadRepository.save.mockResolvedValue({ id: 'upload-1' } as any);

      const result = await service.uploadImage('token-123', mockFile);

      expect(result.id).toBe('upload-1');
    });

    it('Should reject if supabase upload fails', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);
      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('optimized'));

      const mockStorageFrom = {
        upload: jest.fn().mockResolvedValue({
          error: { message: 'Upload failed' },
        }),
        getPublicUrl: jest.fn(),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      await expect(service.uploadImage('token-123', mockFile)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('Should upload PNG image with signature', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);
      const pngFile = {
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        mimetype: 'image/png',
        originalname: 'test.png',
      } as any;

      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('optimized'));

      const mockStorageFrom = {
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/test.webp' },
        }),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      uploadRepository.create.mockReturnValue({
        fileUrl: 'https://example.com/test.webp',
      } as any);
      uploadRepository.save.mockResolvedValue({ id: 'upload-2' } as any);

      const result = await service.uploadImage('token-123', pngFile);

      expect(result.id).toBe('upload-2');
    });

    it('Should upload video file on PREMIUM QR code', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);

      const videoFile = {
        buffer: Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]),
        mimetype: 'video/mp4',
        originalname: 'test.mp4',
      } as any;

      const mockStorageFrom = {
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/test.mp4' },
        }),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      uploadRepository.create.mockReturnValue({
        fileUrl: 'https://example.com/test.mp4',
      } as any);
      uploadRepository.save.mockResolvedValue({ id: 'upload-video' } as any);

      const result = await service.uploadImage('token-123', videoFile);

      expect(result.id).toBe('upload-video');
    });

    it('Should handle file with empty string originalname', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);
      const fileWithoutName = {
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
        mimetype: 'image/jpeg',
        originalname: '',
      } as any;

      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('optimized'));

      const mockStorageFrom = {
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/upload.bin.webp' },
        }),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      uploadRepository.create.mockReturnValue({
        fileUrl: 'https://example.com/upload.bin.webp',
      } as any);
      uploadRepository.save.mockResolvedValue({ id: 'upload-noname' } as any);

      const result = await service.uploadImage('token-123', fileWithoutName);

      expect(result.id).toBe('upload-noname');
      expect(mockSupabaseStorage.from).toHaveBeenCalled();
    });

    it('Should fall back to token as folder prefix when storagePrefix is absent', async () => {
      const qrCodeWithoutPrefix = { ...mockQrCode, storagePrefix: undefined };
      qrcodeService.getQrCodeByToken.mockResolvedValue(qrCodeWithoutPrefix);
      (service as any).countUploadsByQrCodeId = jest.fn().mockResolvedValue(0);
      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('optimized'));

      const mockStorageFrom = {
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/token-123/file.webp' },
        }),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);
      uploadRepository.create.mockReturnValue({
        fileUrl: 'https://example.com/token-123/file.webp',
      } as any);
      uploadRepository.save.mockResolvedValue({ id: 'upload-fallback' } as any);

      const result = await service.uploadImage('token-123', mockFile);

      expect(result.id).toBe('upload-fallback');
      const uploadCall = mockStorageFrom.upload.mock.calls[0][0] as string;
      expect(uploadCall.startsWith('token-123/')).toBe(true);
    });
  });

  describe('getFileUrlsByToken', () => {
    it('Should return cached URLs if available', async () => {
      const mockQrCode = { id: 'qr-1', token: 'token-123' } as any;
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);

      const cachedResult = {
        items: ['url1', 'url2'],
        total: 2,
        skip: null,
      };
      cacheService.get.mockResolvedValue(cachedResult);

      const result = await service.getFileUrlsByToken('token-123', 'user-1');

      expect(result).toEqual(cachedResult);
      expect(uploadRepository.findAndCount).not.toHaveBeenCalled();
    });

    it('Should fetch and cache URLs if not cached', async () => {
      const mockQrCode = { id: 'qr-1', token: 'token-123' } as any;
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);

      uploadRepository.findAndCount.mockResolvedValue([
        [
          {
            id: 'upload-1',
            fileUrl: 'https://example.com/file1.jpg',
            createdAt: new Date(),
          },
        ],
        1,
      ] as any);

      cacheService.get.mockResolvedValue(null);

      const mockStorageFrom = {
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://example.com/signed' },
          error: null,
        }),
        getPublicUrl: jest.fn(),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      const result = await service.getFileUrlsByToken(
        'token-123',
        'user-1',
        20,
        0,
      );

      expect(result.items.length).toBe(1);
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('Should throw if QR code not found', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(null);

      await expect(
        service.getFileUrlsByToken('invalid-token', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('Should handle getSignedUrl fallback to public URL', async () => {
      const mockQrCode = { id: 'qr-1', token: 'token-123' } as any;
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);

      uploadRepository.findAndCount.mockResolvedValue([
        [
          {
            id: 'upload-1',
            fileUrl: 'https://example.com/file1.jpg',
            createdAt: new Date(),
          },
        ],
        1,
      ] as any);

      cacheService.get.mockResolvedValue(null);

      const mockStorageFrom = {
        createSignedUrl: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Error' },
        }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/public' },
        }),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      const result = await service.getFileUrlsByToken('token-123', 'user-1');

      expect(result.items[0]).toBe('https://example.com/public');
    });

    it('Should handle pagination with skip null when no more items', async () => {
      const mockQrCode = { id: 'qr-1', token: 'token-123' } as any;
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);

      uploadRepository.findAndCount.mockResolvedValue([
        [
          { id: 'upload-1', fileUrl: 'url1', createdAt: new Date() },
          { id: 'upload-2', fileUrl: 'url2', createdAt: new Date() },
          { id: 'upload-3', fileUrl: 'url3', createdAt: new Date() },
          { id: 'upload-4', fileUrl: 'url4', createdAt: new Date() },
          { id: 'upload-5', fileUrl: 'url5', createdAt: new Date() },
        ],
        5,
      ] as any);

      cacheService.get.mockResolvedValue(null);

      const mockStorageFrom = {
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed.url' },
          error: null,
        }),
        getPublicUrl: jest.fn(),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      const result = await service.getFileUrlsByToken(
        'token-123',
        'user-1',
        20,
        0,
      );

      expect(result.skip).toBeNull();
      expect(result.total).toBe(5);
    });

    it('Should calculate next skip correctly when more items exist', async () => {
      const mockQrCode = { id: 'qr-1', token: 'token-123' } as any;
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);

      const uploads = Array.from({ length: 10 }, (_, i) => ({
        id: `upload-${i}`,
        fileUrl: `url${i}`,
        createdAt: new Date(),
      }));
      uploadRepository.findAndCount.mockResolvedValue([uploads, 50] as any);

      cacheService.get.mockResolvedValue(null);

      const mockStorageFrom = {
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed.url' },
          error: null,
        }),
        getPublicUrl: jest.fn(),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      const result = await service.getFileUrlsByToken(
        'token-123',
        'user-1',
        10,
        0,
      );

      expect(result.skip).toBe(10);
      expect(result.total).toBe(50);
    });
  });

  describe('countUploadsByQrCodeId', () => {
    it('Should return cached count if available', async () => {
      cacheService.get.mockResolvedValue(5);

      const result = await service.countUploadsByQrCodeId('qr-1');

      expect(result).toBe(5);
      expect(uploadRepository.count).not.toHaveBeenCalled();
    });

    it('Should fetch and cache count if not cached', async () => {
      cacheService.get.mockResolvedValue(null);
      uploadRepository.count.mockResolvedValue(3);

      const result = await service.countUploadsByQrCodeId('qr-1');

      expect(result).toBe(3);
      expect(cacheService.set).toHaveBeenCalled();
    });
  });

  describe('deleteFiles', () => {
    it('Should return early if no URLs provided', async () => {
      await service.deleteFiles([]);

      expect(uploadRepository.find).not.toHaveBeenCalled();
    });

    it('Should delete files and clear cache', async () => {
      const mockFiles = [
        {
          fileUrl: 'url1',
          qrCode: { id: 'qr-1', token: 'token-1' },
        },
        {
          fileUrl: 'url2',
          qrCode: { id: 'qr-1', token: 'token-1' },
        },
      ];

      uploadRepository.find.mockResolvedValue(mockFiles as any);
      uploadRepository.update.mockResolvedValue({ affected: 2 } as any);

      await service.deleteFiles(['url1', 'url2']);

      expect(uploadRepository.update).toHaveBeenCalled();
      expect(cacheService.delByPattern).toHaveBeenCalled();
      expect(cacheService.del).toHaveBeenCalled();
    });

    it('Should handle deletion with no files found', async () => {
      uploadRepository.find.mockResolvedValue([]);

      await service.deleteFiles(['url1']);

      expect(uploadRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('getSignedUrls', () => {
    it('Should handle URL extraction and signing', async () => {
      const mockStorageFrom = {
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed.url' },
          error: null,
        }),
        getPublicUrl: jest.fn(),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      const urls = [
        'https://example.com/storage/v1/object/public/fotouai/file1.jpg',
      ];
      const result = await service.getSignedUrls(urls);

      expect(result[0]).toBe('https://signed.url');
    });

    it('Should extract path correctly when URL matches bucket pattern', async () => {
      const mockStorageFrom = {
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed.url/extracted' },
          error: null,
        }),
        getPublicUrl: jest.fn(),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      const bucket = process.env.SUPABASE_BUCKET || 'FotoUai-Storage';
      const urls = [
        `https://example.com/storage/v1/object/public/${bucket}/path/to/file.jpg`,
      ];
      const result = await service.getSignedUrls(urls);

      expect(result[0]).toBe('https://signed.url/extracted');
      expect(mockStorageFrom.createSignedUrl).toHaveBeenCalledWith(
        'path/to/file.jpg',
        3600,
      );
    });

    it('Should fallback to original URL on error', async () => {
      const mockStorageFrom = {
        createSignedUrl: jest.fn().mockRejectedValue(new Error('Error')),
        getPublicUrl: jest.fn(),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      const urls = ['https://example.com/file1.jpg'];
      const result = await service.getSignedUrls(urls);

      expect(result[0]).toBe('https://example.com/file1.jpg');
    });
  });

  describe('uploadImage - First Upload Email Notification', () => {
    const mockQrCode = {
      id: 'qr-1',
      type: QrCodeType.PAID,
      token: 'token-123',
      eventName: 'Test Event',
      plan: QrCodePlan.PARTY,
      uploadEnabled: true,
    } as any;
    const mockFile = {
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mimetype: 'image/jpeg',
      originalname: 'test.jpg',
    } as any;

    it('Should send email notification on first upload when user has email and notifyOnUpload !== false', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);
      qrcodeService.getQrCodeWithUser.mockResolvedValue({
        id: 'qr-1',
        user: {
          id: 'user-1',
          email: 'user@example.com',
          name: 'John Doe',
          notifyOnUpload: true,
        },
      } as any);

      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('optimized'));

      const mockStorageFrom = {
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/test.webp' },
        }),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      uploadRepository.create.mockReturnValue({
        fileUrl: 'https://example.com/test.webp',
      } as any);
      uploadRepository.save.mockResolvedValue({ id: 'upload-1' } as any);
      uploadRepository.count.mockResolvedValue(0);
      cacheService.get.mockResolvedValue(null);

      await service.uploadImage('token-123', mockFile);

      expect(qrcodeService.getQrCodeWithUser).toHaveBeenCalledWith('qr-1');
      expect(emailService.sendEmail).toHaveBeenCalled();
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        'user@example.com',
        expect.stringContaining('primeira foto'),
        expect.any(String),
        expect.any(String),
      );
    });

    it('Should not send email when user has notifyOnUpload === false', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);
      qrcodeService.getQrCodeWithUser.mockResolvedValue({
        id: 'qr-1',
        user: {
          id: 'user-1',
          email: 'user@example.com',
          name: 'John Doe',
          notifyOnUpload: false,
        },
      } as any);

      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('optimized'));

      const mockStorageFrom = {
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/test.webp' },
        }),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      uploadRepository.create.mockReturnValue({
        fileUrl: 'https://example.com/test.webp',
      } as any);
      uploadRepository.save.mockResolvedValue({ id: 'upload-1' } as any);
      uploadRepository.count.mockResolvedValue(0);
      cacheService.get.mockResolvedValue(null);

      await service.uploadImage('token-123', mockFile);

      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('Should not send email when user has no email', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);
      qrcodeService.getQrCodeWithUser.mockResolvedValue({
        id: 'qr-1',
        user: {
          id: 'user-1',
          email: null,
          name: 'John Doe',
          notifyOnUpload: true,
        },
      } as any);

      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('optimized'));

      const mockStorageFrom = {
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/test.webp' },
        }),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      uploadRepository.create.mockReturnValue({
        fileUrl: 'https://example.com/test.webp',
      } as any);
      uploadRepository.save.mockResolvedValue({ id: 'upload-1' } as any);
      uploadRepository.count.mockResolvedValue(0);
      cacheService.get.mockResolvedValue(null);

      await service.uploadImage('token-123', mockFile);

      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('Should catch and log email sending errors on first upload', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);
      qrcodeService.getQrCodeWithUser.mockResolvedValue({
        id: 'qr-1',
        user: {
          id: 'user-1',
          email: 'user@example.com',
          name: 'John Doe',
          notifyOnUpload: true,
        },
      } as any);

      emailService.sendEmail.mockRejectedValue(
        new Error('Email service error'),
      );

      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('optimized'));

      const mockStorageFrom = {
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/test.webp' },
        }),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      uploadRepository.create.mockReturnValue({
        fileUrl: 'https://example.com/test.webp',
      } as any);
      uploadRepository.save.mockResolvedValue({ id: 'upload-1' } as any);
      uploadRepository.count.mockResolvedValue(0);
      cacheService.get.mockResolvedValue(null);

      // Should not throw, should just log the error
      const result = await service.uploadImage('token-123', mockFile);

      expect(result.id).toBe('upload-1');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to send first upload notification:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('Should not send email notification when not first upload (currentUploads > 0)', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);

      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('optimized'));

      const mockStorageFrom = {
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/test.webp' },
        }),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      uploadRepository.create.mockReturnValue({
        fileUrl: 'https://example.com/test.webp',
      } as any);
      uploadRepository.save.mockResolvedValue({ id: 'upload-2' } as any);
      uploadRepository.count.mockResolvedValue(5); // Not first upload
      cacheService.get.mockResolvedValue(null);

      await service.uploadImage('token-123', mockFile);

      expect(qrcodeService.getQrCodeWithUser).not.toHaveBeenCalled();
      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('getMaxUploadsForPlan', () => {
    it('Should return MAX_FILES_FREE_QRCODE for FREE plan', () => {
      const maxUploads = (service as any).getMaxUploadsForPlan(QrCodePlan.FREE);
      expect(maxUploads).toBe(10); // APP_CONSTANTS.MAX_FILES_FREE_QRCODE
    });

    it('Should return MAX_FILES_PARTY_QRCODE for PARTY plan', () => {
      const maxUploads = (service as any).getMaxUploadsForPlan(
        QrCodePlan.PARTY,
      );
      expect(maxUploads).toBe(100); // APP_CONSTANTS.MAX_FILES_PARTY_QRCODE
    });

    it('Should return null (unlimited) for CORPORATE plan', () => {
      const maxUploads = (service as any).getMaxUploadsForPlan(
        QrCodePlan.CORPORATE,
      );
      expect(maxUploads).toBeNull();
    });

    it('Should return MAX_FILES_FREE_QRCODE for unknown plan', () => {
      const maxUploads = (service as any).getMaxUploadsForPlan('UNKNOWN_PLAN');
      expect(maxUploads).toBe(10); // APP_CONSTANTS.MAX_FILES_FREE_QRCODE
    });
  });

  describe('getGalleryByToken', () => {
    it('Should throw NotFoundException if QR code not found', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(null);

      await expect(service.getGalleryByToken('invalid-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Should throw ForbiddenException if gallery is not enabled', async () => {
      const mockQrCode = {
        id: 'qr-1',
        token: 'token-123',
        galleryEnabled: false,
      } as any;
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);

      await expect(service.getGalleryByToken('token-123')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('Should return cached gallery result if available', async () => {
      const mockQrCode = {
        id: 'qr-1',
        token: 'token-123',
        galleryEnabled: true,
      } as any;
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);

      const cachedResult = {
        items: ['url1', 'url2'],
        total: 2,
        skip: null,
      };
      cacheService.get.mockResolvedValue(cachedResult);

      const result = await service.getGalleryByToken('token-123');

      expect(result).toEqual(cachedResult);
      expect(uploadRepository.findAndCount).not.toHaveBeenCalled();
    });

    it('Should fetch gallery from DB and cache when not cached', async () => {
      const mockQrCode = {
        id: 'qr-1',
        token: 'token-123',
        galleryEnabled: true,
      } as any;
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);

      uploadRepository.findAndCount.mockResolvedValue([
        [
          {
            id: 'upload-1',
            fileUrl: 'https://example.com/file1.jpg',
            createdAt: new Date(),
          },
          {
            id: 'upload-2',
            fileUrl: 'https://example.com/file2.jpg',
            createdAt: new Date(),
          },
        ],
        2,
      ] as any);

      cacheService.get.mockResolvedValue(null);

      const mockStorageFrom = {
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed.url' },
          error: null,
        }),
        getPublicUrl: jest.fn(),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      const result = await service.getGalleryByToken('token-123');

      expect(result.items.length).toBe(2);
      expect(result.total).toBe(2);
      expect(cacheService.set).toHaveBeenCalled();
    });

    it('Should handle gallery pagination with skip null when no more items', async () => {
      const mockQrCode = {
        id: 'qr-1',
        token: 'token-123',
        galleryEnabled: true,
      } as any;
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);

      uploadRepository.findAndCount.mockResolvedValue([
        [
          { id: 'upload-1', fileUrl: 'url1', createdAt: new Date() },
          { id: 'upload-2', fileUrl: 'url2', createdAt: new Date() },
        ],
        2,
      ] as any);

      cacheService.get.mockResolvedValue(null);

      const mockStorageFrom = {
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed.url' },
          error: null,
        }),
        getPublicUrl: jest.fn(),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      const result = await service.getGalleryByToken('token-123', 20, 0);

      expect(result.skip).toBeNull();
      expect(result.total).toBe(2);
    });

    it('Should calculate next skip correctly for gallery pagination', async () => {
      const mockQrCode = {
        id: 'qr-1',
        token: 'token-123',
        galleryEnabled: true,
      } as any;
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);

      const uploads = Array.from({ length: 10 }, (_, i) => ({
        id: `upload-${i}`,
        fileUrl: `url${i}`,
        createdAt: new Date(),
      }));
      uploadRepository.findAndCount.mockResolvedValue([uploads, 50] as any);

      cacheService.get.mockResolvedValue(null);

      const mockStorageFrom = {
        createSignedUrl: jest.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed.url' },
          error: null,
        }),
        getPublicUrl: jest.fn(),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      const result = await service.getGalleryByToken('token-123', 10, 0);

      expect(result.skip).toBe(10);
      expect(result.total).toBe(50);
    });
  });

  describe('buildFirstUploadHtml', () => {
    it('Should generate valid HTML email template for first upload', () => {
      const html = (service as any).buildFirstUploadHtml(
        'John Doe',
        'My Event',
        'http://localhost:3001',
      );

      expect(html).toContain('John Doe');
      expect(html).toContain('My Event');
      expect(html).toContain('http://localhost:3001');
      expect(html).toContain('FotoUai');
      expect(html).toContain('Primeira foto recebida');
      expect(html).toContain('Ver no Dashboard');
    });

    it('Should include current year in footer', () => {
      const currentYear = new Date().getFullYear();
      const html = (service as any).buildFirstUploadHtml(
        'Jane Doe',
        'Test Event',
        'http://example.com',
      );

      expect(html).toContain(currentYear.toString());
    });

    it('Should generate HTML with proper styling and structure', () => {
      const html = (service as any).buildFirstUploadHtml(
        'Test User',
        'Test Event',
        'http://localhost:3001',
      );

      expect(html).toContain('font-family');
      expect(html).toContain('background');
      expect(html).toContain('padding');
      expect(html).toContain('border-radius');
    });
  });

  describe('uploadImage - first upload email fallback branches', () => {
    const mockQrCode = {
      id: 'qr-1',
      type: QrCodeType.PAID,
      token: 'token-123',
      eventName: null,
      uploadEnabled: true,
    } as any;
    const mockFile = {
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mimetype: 'image/jpeg',
      originalname: 'test.jpg',
    } as any;

    it('Should use fallback strings when user.name and qrCode.eventName are null', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue(mockQrCode);
      cacheService.get.mockResolvedValue(null);
      uploadRepository.count.mockResolvedValue(0);
      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('optimized'));

      const mockStorageFrom = {
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/test.webp' },
        }),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      uploadRepository.create.mockReturnValue({
        fileUrl: 'https://example.com/test.webp',
      } as any);
      uploadRepository.save.mockResolvedValue({ id: 'upload-1' } as any);

      const qrWithUser = {
        user: { email: 'user@test.com', name: null, notifyOnUpload: true },
      };
      qrcodeService.getQrCodeWithUser.mockResolvedValue(qrWithUser as any);
      emailService.sendEmail.mockResolvedValue(undefined);

      await service.uploadImage('token-123', mockFile);

      expect(emailService.sendEmail).toHaveBeenCalledWith(
        'user@test.com',
        expect.anything(),
        expect.stringContaining('Olá !'),
        expect.anything(),
      );
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        'user@test.com',
        expect.anything(),
        expect.stringContaining('Seu Evento'),
        expect.anything(),
      );
    });

    it('Should handle updateLastUploadAt error silently', async () => {
      qrcodeService.getQrCodeByToken.mockResolvedValue({
        ...mockQrCode,
        eventName: 'My Event',
      } as any);
      cacheService.get.mockResolvedValue(null);
      uploadRepository.count.mockResolvedValue(1);
      mockSharpInstance.toBuffer.mockResolvedValue(Buffer.from('optimized'));

      const mockStorageFrom = {
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: jest.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/test.webp' },
        }),
      };
      mockSupabaseStorage.from.mockReturnValue(mockStorageFrom as any);

      uploadRepository.create.mockReturnValue({
        fileUrl: 'https://example.com/test.webp',
      } as any);
      uploadRepository.save.mockResolvedValue({ id: 'upload-1' } as any);

      qrcodeService.updateLastUploadAt.mockRejectedValue(new Error('DB error'));

      const result = await service.uploadImage('token-123', mockFile);

      expect(result.id).toBe('upload-1');
    });
  });
});

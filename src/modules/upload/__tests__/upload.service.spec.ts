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
import { CacheService } from '../../../common/services/cache.service';
import { QrCodeType } from '../../../common/enum/qrcode-type.enum';

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
          provide: CacheService,
          useValue: cacheService,
        },
      ],
    })
      .overrideProvider('UploadRepository')
      .useValue(uploadRepository)
      .compile();

    service = new UploadService(uploadRepository, qrcodeService, cacheService);
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
    } as any;
    const mockFile = {
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mimetype: 'image/jpeg',
      originalname: 'test.jpg',
    } as any;

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
});

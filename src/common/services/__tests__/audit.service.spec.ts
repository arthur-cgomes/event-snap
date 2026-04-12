import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MockRepository, repositoryMockFactory } from '../../utils/test.util';
import { AuditLog } from '../../entity/audit-log.entity';
import { AuditService } from '../audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let auditRepository: MockRepository<Repository<AuditLog>>;

  const mockAuditLog = {
    id: 'log-id',
    adminId: 'admin-id',
    adminEmail: 'admin@example.com',
    action: 'USER_CREATED',
    targetId: 'user-id',
    details: { name: 'New User' },
    createdAt: new Date(),
  } as unknown as AuditLog;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: repositoryMockFactory<AuditLog>(),
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    auditRepository = module.get(getRepositoryToken(AuditLog));
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    it('Should create audit log entry', async () => {
      auditRepository.create = jest.fn().mockReturnValue(mockAuditLog);
      auditRepository.save = jest.fn().mockResolvedValue(mockAuditLog);

      await service.log(
        'admin-id',
        'admin@example.com',
        'USER_CREATED',
        'user-id',
        { name: 'New User' },
      );

      expect(auditRepository.create).toHaveBeenCalledWith({
        adminId: 'admin-id',
        adminEmail: 'admin@example.com',
        action: 'USER_CREATED',
        targetId: 'user-id',
        details: { name: 'New User' },
      });
      expect(auditRepository.save).toHaveBeenCalledWith(mockAuditLog);
    });

    it('Should create audit log without targetId and details', async () => {
      auditRepository.create = jest.fn().mockReturnValue(mockAuditLog);
      auditRepository.save = jest.fn().mockResolvedValue(mockAuditLog);

      await service.log('admin-id', 'admin@example.com', 'SYSTEM_UPDATE');

      expect(auditRepository.create).toHaveBeenCalledWith({
        adminId: 'admin-id',
        adminEmail: 'admin@example.com',
        action: 'SYSTEM_UPDATE',
        targetId: undefined,
        details: undefined,
      });
      expect(auditRepository.save).toHaveBeenCalled();
    });
  });

  describe('getRecentLogs', () => {
    it('Should get recent logs with defaults', async () => {
      auditRepository.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockAuditLog], 1]);

      const result = await service.getRecentLogs();

      expect(result.items).toEqual([mockAuditLog]);
      expect(result.total).toBe(1);
      expect(auditRepository.findAndCount).toHaveBeenCalledWith({
        take: 50,
        skip: 0,
        order: { createdAt: 'DESC' },
      });
    });

    it('Should get recent logs with custom take and skip', async () => {
      auditRepository.findAndCount = jest
        .fn()
        .mockResolvedValue([[mockAuditLog], 5]);

      const result = await service.getRecentLogs(10, 20);

      expect(result.items).toEqual([mockAuditLog]);
      expect(result.total).toBe(5);
      expect(auditRepository.findAndCount).toHaveBeenCalledWith({
        take: 10,
        skip: 20,
        order: { createdAt: 'DESC' },
      });
    });

    it('Should return empty array when no logs found', async () => {
      auditRepository.findAndCount = jest.fn().mockResolvedValue([[], 0]);

      const result = await service.getRecentLogs();

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});

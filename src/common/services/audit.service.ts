import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entity/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  async log(
    adminId: string,
    adminEmail: string,
    action: string,
    targetId?: string,
    details?: Record<string, any>,
  ): Promise<void> {
    const entry = this.auditRepository.create({
      adminId,
      adminEmail,
      action,
      targetId,
      details,
    });
    await this.auditRepository.save(entry);
  }

  async getRecentLogs(
    take = 50,
    skip = 0,
  ): Promise<{ items: AuditLog[]; total: number }> {
    const [items, total] = await this.auditRepository.findAndCount({
      take,
      skip,
      order: { createdAt: 'DESC' },
    });
    return { items, total };
  }
}

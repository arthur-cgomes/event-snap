import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../modules/user/entity/user.entity';
import { UserType } from '../enum/user-type.enum';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedAdmin();
  }

  private async seedAdmin(): Promise<void> {
    const adminEmail = 'admin@fotouai.com.br';
    const exists = await this.userRepository.findOne({
      where: { email: adminEmail },
    });

    if (exists) return;

    const admin = this.userRepository.create({
      name: 'Admin Global',
      email: adminEmail,
      password: '102030@Aa',
      userType: UserType.ADMIN,
      notifyOnUpload: true,
      notifyOnExpiration: true,
      notifyOnPayment: true,
    });

    await this.userRepository.save(admin);
    console.log(`[Seed] Admin ${adminEmail} created.`);
  }
}

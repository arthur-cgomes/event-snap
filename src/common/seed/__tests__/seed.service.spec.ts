import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SeedService } from '../seed.service';
import { User } from '../../../modules/user/entity/user.entity';

describe('SeedService', () => {
  let service: SeedService;
  let userRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    userRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeedService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
      ],
    }).compile();

    service = module.get<SeedService>(SeedService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should skip seed if admin already exists', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'existing-id' });

    await service.onApplicationBootstrap();

    expect(userRepository.create).not.toHaveBeenCalled();
    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('should create admin when not found', async () => {
    userRepository.findOne.mockResolvedValue(null);
    userRepository.create.mockReturnValue({ email: 'admin@fotouai.com.br' });
    userRepository.save.mockResolvedValue({ id: 'new-id' });

    await service.onApplicationBootstrap();

    expect(userRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'admin@fotouai.com.br' }),
    );
    expect(userRepository.save).toHaveBeenCalled();
  });
});

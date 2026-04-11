import { Test, TestingModule } from '@nestjs/testing';
import { CashService } from './cash.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CashService', () => {
  let service: CashService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashService,
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<CashService>(CashService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { ConfigService } from '@nestjs/config';

describe('UploadsController', () => {
  let controller: UploadsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [
        UploadsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
            getOrThrow: jest.fn((key: string) => {
              const values: Record<string, string> = {
                AWS_REGION: 'us-east-1',
                AWS_S3_BUCKET: 'bucket',
                AWS_ACCESS_KEY_ID: 'key',
                AWS_SECRET_ACCESS_KEY: 'secret',
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<UploadsController>(UploadsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../../package.json') as { version: string };

describe('HealthController (HTTP)', () => {
  let app: INestApplication;
  let queryRawSpy: jest.Mock;

  beforeAll(async () => {
    queryRawSpy = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRaw: queryRawSpy },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns {status:"ok"}', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /health/version returns 200 with status, app, and version', () => {
    return request(app.getHttpServer())
      .get('/health/version')
      .expect(200)
      .expect({ status: 'ok', app: 'storefront-01', version });
  });

  it('GET /health/version does not call PrismaService.$queryRaw', async () => {
    await request(app.getHttpServer()).get('/health/version');
    expect(queryRawSpy).not.toHaveBeenCalled();
  });
});

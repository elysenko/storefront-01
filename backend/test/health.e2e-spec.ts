import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { HealthController } from '../src/health/health.controller';
import { PrismaService } from '../src/prisma/prisma.service';

describe('HealthController (e2e)', () => {
  let app: INestApplication;
  const queryRawMock = jest.fn();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRaw: queryRawMock },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    queryRawMock.mockClear();
  });

  it('GET /api/health/version returns 200 with status, app, and non-empty version', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health/version')
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.app).toBe('storefront-01');
    expect(typeof res.body.version).toBe('string');
    expect(res.body.version.length).toBeGreaterThan(0);
  });

  it('GET /api/health/version does not call PrismaService', async () => {
    await request(app.getHttpServer()).get('/api/health/version').expect(200);
    expect(queryRawMock).not.toHaveBeenCalled();
  });

  it('GET /api/health returns 200 with { status: "ok" }', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(res.body).toEqual({ status: 'ok' });
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as supertest from 'supertest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
) as { version: string };

describe('HealthController (HTTP)', () => {
  let app: INestApplication;
  let prismaStub: { $queryRaw: jest.Mock };

  beforeAll(async () => {
    prismaStub = { $queryRaw: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaStub }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 { status: "ok" }', async () => {
    await supertest(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /health/version returns 200 with app and version', async () => {
    const res = await supertest(app.getHttpServer())
      .get('/health/version')
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.app).toBe('storefront-01');
    expect(res.body.version).toBe(pkg.version);
    expect(res.body.version.length).toBeGreaterThan(0);
  });

  it('GET /health/version does not call PrismaService.$queryRaw', async () => {
    await supertest(app.getHttpServer()).get('/health/version').expect(200);
    expect(prismaStub.$queryRaw).not.toHaveBeenCalled();
  });
});

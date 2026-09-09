import { readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as supertest from 'supertest';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

const PKG_VERSION: string = (
  JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
    version: string;
  }
).version;

describe('HealthController (HTTP)', () => {
  let app: INestApplication;
  let prismaStub: { $queryRaw: jest.Mock };

  beforeAll(async () => {
    prismaStub = { $queryRaw: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prismaStub }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('returns 200 { status: "ok" }', async () => {
      await supertest(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect({ status: 'ok' });
    });
  });

  describe('GET /health/version', () => {
    it('returns 200 with app and version fields', async () => {
      const res = await supertest(app.getHttpServer())
        .get('/health/version')
        .expect(200);

      expect(res.body.status).toBe('ok');
      expect(res.body.app).toBe('storefront-01');
      expect(res.body.version).toBe(PKG_VERSION);
      expect(res.body.version.length).toBeGreaterThan(0);
    });

    it('never calls prisma.$queryRaw', async () => {
      await supertest(app.getHttpServer()).get('/health/version').expect(200);
      expect(prismaStub.$queryRaw).not.toHaveBeenCalled();
    });
  });
});

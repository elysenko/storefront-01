import { readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as supertest from 'supertest';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

const pkgVersion: string = (
  JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')) as {
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

  it('GET /health returns 200 { status: ok }', async () => {
    const res = await supertest(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/version returns 200 with app and version', async () => {
    const res = await supertest(app.getHttpServer()).get('/health/version').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.app).toBe('storefront-01');
    expect(res.body.version).toBe(pkgVersion);
    expect((res.body.version as string).length).toBeGreaterThan(0);
  });

  it('PrismaService.$queryRaw is never called by liveness or version endpoints', () => {
    expect(prismaStub.$queryRaw).not.toHaveBeenCalled();
  });
});

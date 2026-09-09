import { readFileSync } from 'fs';
import { join } from 'path';
import { HealthController } from './health.controller';
import type { PrismaService } from '../prisma/prisma.service';

const pkgVersion = (): string => {
  const raw = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
  const parsed = JSON.parse(raw) as { version?: unknown };
  const v = parsed.version;
  return typeof v === 'string' && v.length > 0 ? v : '0.0.0';
};

describe('HealthController', () => {
  let controller: HealthController;
  const prismaDouble = {
    $queryRaw: jest.fn(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new HealthController(prismaDouble);
  });

  describe('version()', () => {
    it('returns { status: "ok", app: "storefront-01", version: <package version> }', () => {
      const result = controller.version();
      expect(result).toEqual({
        status: 'ok',
        app: 'storefront-01',
        version: pkgVersion(),
      });
    });

    it('never calls any Prisma method', () => {
      controller.version();
      expect((prismaDouble as { $queryRaw: jest.Mock }).$queryRaw).not.toHaveBeenCalled();
      expect((prismaDouble as { $connect: jest.Mock }).$connect).not.toHaveBeenCalled();
      expect((prismaDouble as { $disconnect: jest.Mock }).$disconnect).not.toHaveBeenCalled();
    });
  });
});

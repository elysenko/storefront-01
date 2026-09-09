import { readFileSync } from 'fs';
import { join } from 'path';
import { Controller, Get, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

const APP_NAME = 'storefront-01';

function resolveAppVersion(): string {
  try {
    const raw = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    const v = parsed.version;
    if (typeof v === 'string' && v.length > 0) return v;
  } catch {
    // fall through to env fallback
  }
  return process.env.npm_package_version ?? '0.0.0';
}

const APP_VERSION = resolveAppVersion();

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: process is up. Never touches the database. */
  @Get()
  live(): { status: string } {
    return { status: 'ok' };
  }

  /** Version: returns app name and version. Never touches the database. */
  @Get('version')
  version(): { status: string; app: string; version: string } {
    return { status: 'ok', app: APP_NAME, version: APP_VERSION };
  }

  /** Readiness: the database answers. 503 when it does not. */
  @Get('deep')
  async deep(): Promise<{ status: string; database: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'unreachable',
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      });
    }
    return { status: 'ok', database: 'ok' };
  }
}

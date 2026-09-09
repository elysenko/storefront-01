import { readFileSync } from 'fs';
import { join } from 'path';
import { Controller, Get, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

const APP_NAME = 'storefront-01';

function resolveVersion(): string {
  const candidates = [
    join(__dirname, '..', '..', 'package.json'),
    join(__dirname, '..', '..', '..', 'package.json'),
    join(process.cwd(), 'package.json'),
  ];
  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(candidate, 'utf-8')) as { version?: string };
      if (pkg.version && pkg.version.length > 0) {
        return pkg.version;
      }
    } catch {
      // try next candidate
    }
  }
  return process.env.npm_package_version ?? '0.0.0';
}

const APP_VERSION = resolveVersion();

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: process is up. Never touches the database. */
  @Get()
  live(): { status: string } {
    return { status: 'ok' };
  }

  /** Version: returns app name and current version. Never touches the database. */
  @Get('version')
  @ApiOkResponse({ description: 'App version info' })
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

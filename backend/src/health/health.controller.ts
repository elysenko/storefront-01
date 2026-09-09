import { Controller, Get, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg = require('../../package.json') as { version: string };

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: process is up. Never touches the database. */
  @Get()
  live(): { status: string } {
    return { status: 'ok' };
  }

  /** Version: returns the app name and current package version. DB-free. */
  @Get('version')
  version(): { status: string; app: string; version: string } {
    return { status: 'ok', app: 'storefront-01', version: pkg.version };
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

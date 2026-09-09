import { Controller, Get, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { APP_NAME, resolveAppVersion } from './app-version';

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

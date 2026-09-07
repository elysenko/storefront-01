import { Injectable, Logger, OnModuleDestroy, OnModuleInit, INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Background reconnect cadence while the database is unreachable. */
const RECONNECT_INTERVAL_MS = 5_000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private reconnectTimer?: NodeJS.Timeout;

  /**
   * A database that is not up yet must never kill the process: the pod has to
   * stay alive so the DB-free `/api/health` liveness probe keeps answering
   * while `/api/health/deep` readiness fails. So the initial `$connect()` is
   * best-effort and a background retry takes over on failure. Prisma also
   * connects lazily on the first query, so a late-arriving database recovers
   * either way.
   */
  async onModuleInit(): Promise<void> {
    await this.tryConnect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    await this.$disconnect().catch(() => undefined);
  }

  enableShutdownHooks(app: INestApplication): void {
    this.$on('beforeExit' as never, async () => {
      await app.close();
    });
  }

  private async tryConnect(): Promise<void> {
    try {
      await this.$connect();
      if (this.reconnectTimer) {
        clearInterval(this.reconnectTimer);
        this.reconnectTimer = undefined;
      }
      this.logger.log('Database connection established.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Database unreachable at startup (${message}). Serving liveness while retrying in the background.`,
      );
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnectTimer = setInterval(() => {
      void this.tryConnect();
    }, RECONNECT_INTERVAL_MS);
    // Never hold the event loop open on account of the retry timer.
    this.reconnectTimer.unref?.();
  }
}

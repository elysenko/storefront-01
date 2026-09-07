import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isUsable, resolveConfig } from '../lib/config';

interface SettingDefinition {
  key: string;
  label: string;
  service: string;
  secret: boolean;
  /** Alternative env var names the platform may have provisioned instead. */
  envFallbacks?: string[];
}

/** Mirrors web `core/models.ts` `SystemSetting`. */
export interface SettingView {
  key: string;
  label: string;
  service: string;
  value: string;
  configured: boolean;
  secret: boolean;
}

/**
 * The credential keys for the services provisioned alongside this app. Values
 * resolve env-first and fall back to the SystemSetting row an admin saved.
 */
export const SETTING_DEFINITIONS: SettingDefinition[] = [
  { key: 'DATABASE_URL', label: 'Connection string', service: 'postgresql', secret: true },
  { key: 'POSTGRES_HOST', label: 'Host', service: 'postgresql', secret: false, envFallbacks: ['DATABASE_HOST', 'PGHOST'] },
  { key: 'POSTGRES_PORT', label: 'Port', service: 'postgresql', secret: false, envFallbacks: ['DATABASE_PORT', 'PGPORT'] },
  { key: 'POSTGRES_DB', label: 'Database', service: 'postgresql', secret: false, envFallbacks: ['DATABASE_NAME', 'PGDATABASE'] },
  { key: 'POSTGRES_USER', label: 'User', service: 'postgresql', secret: false, envFallbacks: ['DATABASE_USER', 'PGUSER'] },
  { key: 'POSTGRES_PASSWORD', label: 'Password', service: 'postgresql', secret: true, envFallbacks: ['DATABASE_PASSWORD', 'PGPASSWORD'] },
  { key: 'MINIO_ENDPOINT', label: 'Endpoint', service: 'minio', secret: false },
  { key: 'MINIO_ACCESS_KEY', label: 'Access key', service: 'minio', secret: true, envFallbacks: ['MINIO_ROOT_USER'] },
  { key: 'MINIO_SECRET_KEY', label: 'Secret key', service: 'minio', secret: true, envFallbacks: ['MINIO_ROOT_PASSWORD'] },
  { key: 'MINIO_BUCKET', label: 'Bucket', service: 'minio', secret: false },
];

const KNOWN_KEYS = new Set(SETTING_DEFINITIONS.map((d) => d.key));

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Secrets are masked before they leave the process — never echo a credential. */
  async list(): Promise<SettingView[]> {
    const views: SettingView[] = [];
    for (const definition of SETTING_DEFINITIONS) {
      const resolved = await resolveConfig(this.prisma, definition.key, definition.envFallbacks);
      const configured = isUsable(resolved);
      views.push({
        key: definition.key,
        label: definition.label,
        service: definition.service,
        secret: definition.secret,
        configured,
        value: !configured ? '' : definition.secret ? SettingsService.mask(resolved) : resolved,
      });
    }
    return views;
  }

  /**
   * Upserts the supplied key/value pairs. Accepts `[{key,value}]`,
   * `{settings:[…]}` or a flat `{KEY: value}` map so the SPA can post whichever
   * shape is convenient. Unknown keys are rejected rather than silently stored.
   */
  async update(body: unknown): Promise<SettingView[]> {
    const pairs = SettingsService.normalize(body);
    if (pairs.length === 0) {
      throw new BadRequestException('Send at least one setting to save.');
    }
    for (const pair of pairs) {
      if (!KNOWN_KEYS.has(pair.key)) {
        throw new BadRequestException(`Unknown setting "${pair.key}".`);
      }
    }
    for (const pair of pairs) {
      await this.prisma.systemSetting.upsert({
        where: { key: pair.key },
        update: { value: pair.value },
        create: { key: pair.key, value: pair.value },
      });
    }
    return this.list();
  }

  private static normalize(body: unknown): { key: string; value: string }[] {
    const raw: unknown = Array.isArray(body)
      ? body
      : typeof body === 'object' && body !== null && Array.isArray((body as { settings?: unknown }).settings)
        ? (body as { settings: unknown[] }).settings
        : typeof body === 'object' && body !== null
          ? Object.entries(body as Record<string, unknown>).map(([key, value]) => ({ key, value }))
          : [];

    if (!Array.isArray(raw)) {
      return [];
    }
    return raw
      .filter((entry): entry is { key: unknown; value: unknown } =>
        typeof entry === 'object' && entry !== null && 'key' in entry,
      )
      .map((entry) => ({ key: String(entry.key), value: String(entry.value ?? '') }))
      .filter((entry) => entry.value.trim() !== '');
  }

  private static mask(value: string): string {
    const tail = value.slice(-4);
    return `${'•'.repeat(8)}${tail}`;
  }
}

import { HttpException, HttpStatus } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

/** Written by the deploy pipeline when a credential has not been supplied. */
export const PLACEHOLDER = 'PLACEHOLDER_CONFIGURE_IN_SETTINGS';

export function isUsable(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== '' && value !== PLACEHOLDER;
}

/**
 * Resolution order for every third-party credential:
 *   1. the environment (mounted from app-secrets at deploy time)
 *   2. the SystemSetting row an admin saved in /admin/settings
 *   3. null — the feature is unconfigured and must degrade, never crash
 */
export async function resolveConfig(
  prisma: PrismaService,
  key: string,
  envFallbacks: string[] = [],
): Promise<string | null> {
  for (const candidate of [key, ...envFallbacks]) {
    if (isUsable(process.env[candidate])) {
      return process.env[candidate] as string;
    }
  }
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  return isUsable(row?.value) ? (row as { value: string }).value : null;
}

/**
 * Thrown at call time by a feature whose credentials are missing. Maps to 503
 * so a missing integration key degrades one feature instead of crash-looping
 * the pod at boot.
 */
export class ServiceUnconfiguredError extends HttpException {
  constructor(service: string) {
    super(
      `${service} is not configured yet — an administrator can add its credentials in Admin → Settings.`,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

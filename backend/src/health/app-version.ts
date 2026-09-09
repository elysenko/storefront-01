import { readFileSync } from 'fs';
import { join } from 'path';

export const APP_NAME = 'storefront-01';

export function resolveAppVersion(
  pkgPath: string = join(__dirname, '../../package.json'),
): string {
  try {
    const raw = readFileSync(pkgPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'version' in parsed &&
      typeof (parsed as Record<string, unknown>).version === 'string' &&
      (parsed as Record<string, string>).version.length > 0
    ) {
      return (parsed as Record<string, string>).version;
    }
  } catch {
    // fall through to env / default
  }
  if (process.env.npm_package_version) {
    return process.env.npm_package_version;
  }
  return '0.0.0';
}

import { readFileSync } from 'fs';
import { join } from 'path';

export const APP_NAME = 'storefront-01';

export function readPackageVersion(): string {
  try {
    const raw = readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { version?: unknown };
    if (typeof pkg.version === 'string' && pkg.version.length > 0) {
      return pkg.version;
    }
    return '0.0.0';
  } catch {
    return '0.0.0';
  }
}

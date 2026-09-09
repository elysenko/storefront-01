import { readFileSync } from 'fs';
import { join } from 'path';
import { APP_NAME, readPackageVersion } from './app-version';

describe('app-version', () => {
  it('APP_NAME is storefront-01', () => {
    expect(APP_NAME).toBe('storefront-01');
  });

  it('readPackageVersion() returns the version from backend/package.json', () => {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ) as { version: string };
    const expected = pkg.version;
    expect(readPackageVersion()).toBe(expected);
  });

  it('readPackageVersion() returns a non-empty string', () => {
    const version = readPackageVersion();
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });
});

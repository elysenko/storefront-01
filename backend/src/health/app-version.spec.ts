import { APP_NAME, resolveAppVersion } from './app-version';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('app-version', () => {
  it('APP_NAME is storefront-01', () => {
    expect(APP_NAME).toBe('storefront-01');
  });

  it('resolveAppVersion() returns the version from backend/package.json (happy path)', () => {
    const pkgVersion = JSON.parse(
      readFileSync(join(__dirname, '../../package.json'), 'utf8'),
    ).version as string;

    const result = resolveAppVersion();
    expect(result).toBe(pkgVersion);
    expect(result.length).toBeGreaterThan(0);
  });

  it('resolveAppVersion() does not throw on a non-existent path and returns a non-empty string', () => {
    let result: string;
    expect(() => {
      result = resolveAppVersion('/nonexistent/package.json');
    }).not.toThrow();
    // @ts-expect-error assigned inside callback above
    expect(typeof result).toBe('string');
    // @ts-expect-error assigned inside callback above
    expect(result.length).toBeGreaterThan(0);
  });
});

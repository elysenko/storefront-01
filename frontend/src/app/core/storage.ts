/**
 * Namespaced browser storage.
 *
 * Mockups are served many-per-origin at `/<mockup_id>/` and storage is
 * origin-scoped, not path-scoped. Every key is therefore prefixed with the
 * deployment path segment using a colon separator, so two mockups open in the
 * same browser cannot clobber each other's state.
 *
 * Never read/write a bare `token` / `user` / `isAuthenticated` key.
 */

/**
 * The deployment prefix, taken from <base href>: `/<mockup_id>/` on the mockup
 * host, `/` when the app is served at an origin root.
 *
 * It must NOT be read from location.pathname — at the site root the first path
 * segment is the current route ("cart", "orders", "products"), so the namespace
 * would change on every navigation and scatter state across per-route buckets.
 * <base href> is fixed at build time, so it is stable across routes and still
 * resolves to the mockup id on the preview host.
 */
function resolveNamespace(): string {
  if (typeof document === 'undefined') {
    return 'app';
  }
  const href = document.querySelector('base')?.getAttribute('href') ?? '/';
  const segment = href.replace(/^\/+|\/+$/g, '').split('/')[0];
  return segment || 'app';
}

const NS = resolveNamespace();

export const nsKey = (key: string): string => `${NS}:${key}`;

export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(nsKey(key));
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(nsKey(key), value);
  } catch {
    /* storage unavailable (private mode / quota) — non-fatal */
  }
}

export function removeKeys(...keys: string[]): void {
  try {
    for (const key of keys) {
      localStorage.removeItem(nsKey(key));
    }
  } catch {
    /* non-fatal */
  }
}

/**
 * Read + parse + validate in one step. Anything restored from storage is
 * untrusted: on a parse failure or a shape the validator rejects, the key is
 * cleared and `null` returned so the caller can continue to a usable screen
 * instead of throwing and blanking the page.
 */
export function readValidated<T>(key: string, isValid: (value: unknown) => value is T): T | null {
  const raw = readRaw(key);
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isValid(parsed)) {
      return parsed;
    }
    removeKeys(key);
    return null;
  } catch {
    removeKeys(key);
    return null;
  }
}

/**
 * Shape guard for a persisted collection: an array whose every entry is an
 * object carrying a string `id`. Deliberately loose — it only has to reject
 * garbage, not re-validate the whole domain model.
 */
export function isEntityArray(value: unknown): value is { id: string }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { id?: unknown }).id === 'string',
    )
  );
}

export function writeJson(key: string, value: unknown): void {
  try {
    writeRaw(key, JSON.stringify(value));
  } catch {
    /* non-fatal */
  }
}

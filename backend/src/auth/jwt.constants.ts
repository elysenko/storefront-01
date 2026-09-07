import type { SignOptions } from 'jsonwebtoken';

/**
 * HS256 signing secret. `JWT_SECRET` is app-owned config the platform always
 * provisions; the fallback exists only so a local `npm run start:dev` without a
 * .env boots instead of crash-looping.
 */
export const JWT_SECRET = process.env.JWT_SECRET ?? 'storefront-local-dev-secret';

/** e.g. `7d`, `1d`, `3600`. Validated by jsonwebtoken at sign time. */
export const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ??
  '7d') as SignOptions['expiresIn'];

import { Role } from '@prisma/client';

/**
 * The Storefront spec has two actors — `admin` and `shopper` — while the
 * platform account contract mints ADMIN / MANAGER / USER. ADMIN maps to the
 * spec's admin; every other role is a shopper. The API (and the JWT payload)
 * always speaks the spec's vocabulary so the SPA never sees platform roles.
 */
export type ApiRole = 'admin' | 'shopper';

export function toApiRole(role: Role): ApiRole {
  return role === Role.ADMIN ? 'admin' : 'shopper';
}

export interface AuthUser {
  id: string;
  email: string;
  role: ApiRole;
}

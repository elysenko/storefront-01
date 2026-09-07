import { signal } from '@angular/core';
import type { User } from './models';
import { readRaw, readValidated, removeKeys, writeJson, writeRaw } from './storage';

/**
 * Session state, held outside Angular's injector on purpose.
 *
 * The HTTP interceptor has to be able to read the bearer token and tear the
 * session down on a 401, and `AuthService` has to be able to call the API to
 * establish one. Routing that through a single injectable would make
 * `AuthService -> HttpClient -> interceptor -> AuthService` a construction
 * cycle, so the token and the current user live in plain module state that both
 * sides import directly.
 */

const USER_KEY = 'user';
const TOKEN_KEY = 'token';

/** Untrusted-input validator for anything restored from browser storage. */
export function isUser(value: unknown): value is User {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<User>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.email === 'string' &&
    (candidate.role === 'admin' || candidate.role === 'shopper')
  );
}

function restore(): User | null {
  try {
    return readValidated<User>(USER_KEY, isUser);
  } catch {
    removeKeys(USER_KEY, TOKEN_KEY);
    return null;
  }
}

/**
 * Hydrated synchronously at module load so route guards resolve correctly on a
 * cold load of a deep link — `/api/auth/me` then re-validates in the background.
 */
export const sessionUser = signal<User | null>(restore());

export function sessionToken(): string | null {
  return readRaw(TOKEN_KEY);
}

/** Stores the JWT issued by POST /api/auth/{login,signup}. */
export function startSession(user: User, token: string): void {
  writeRaw(TOKEN_KEY, token);
  writeJson(USER_KEY, user);
  sessionUser.set(user);
}

/** Refreshes the cached profile without touching the token (GET /api/auth/me). */
export function refreshSessionUser(user: User): void {
  writeJson(USER_KEY, user);
  sessionUser.set(user);
}

export function endSession(): void {
  removeKeys(USER_KEY, TOKEN_KEY);
  sessionUser.set(null);
}

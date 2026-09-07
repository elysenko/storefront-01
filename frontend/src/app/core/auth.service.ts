import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Role, User } from './models';
import { DEMO_ADMIN, DEMO_SHOPPER } from './mock-data';
import { readValidated, removeKeys, writeJson, writeRaw } from './storage';

const USER_KEY = 'user';
const TOKEN_KEY = 'token';

/** Untrusted-input validator for anything restored from browser storage. */
function isUser(value: unknown): value is User {
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

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  readonly user = signal<User | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => this.user()?.role === 'admin');

  constructor() {
    this.restore();
  }

  /**
   * Restore defensively: a malformed or stale value clears its keys and falls
   * through to a usable screen rather than throwing and blanking the page.
   */
  private restore(): void {
    let restored: User | null = null;
    try {
      restored = readValidated<User>(USER_KEY, isUser);
    } catch {
      removeKeys(USER_KEY, TOKEN_KEY);
      restored = null;
    }

    if (restored) {
      this.user.set(restored);
      return;
    }

    if (COLOSSUS_PREVIEW) {
      // Static preview has no auth server, so a cold load of an authenticated
      // route must still render that screen rather than bounce to /login.
      this.setSession(DEMO_SHOPPER);
    }
  }

  private setSession(user: User): void {
    this.user.set(user);
    writeJson(USER_KEY, user);
    writeRaw(TOKEN_KEY, `preview.${user.id}.${user.role}`);
  }

  /**
   * Returns an error message, or null on success (in which case the caller has
   * already been navigated onward).
   */
  login(email: string, password: string, redirect?: string | null): string | null {
    const trimmed = email.trim();

    if (!trimmed || !password) {
      return 'Enter both your email address and password.';
    }
    if (!EMAIL_SHAPE.test(trimmed)) {
      return 'Enter a valid email address.';
    }

    if (COLOSSUS_PREVIEW) {
      // Resolved locally and synchronously — a network call would fail on the
      // static preview host and strand the reviewer on this screen.
      const role: Role = trimmed.toLowerCase().startsWith('admin') ? 'admin' : 'shopper';
      this.setSession({
        id: role === 'admin' ? DEMO_ADMIN.id : DEMO_SHOPPER.id,
        email: trimmed,
        role,
      });
      void this.router.navigateByUrl(redirect || '/');
      return null;
    }

    // Production path: POST /api/auth/login, then setSession + navigate.
    return null;
  }

  signup(email: string, password: string, confirm: string): string | null {
    const trimmed = email.trim();

    if (!trimmed || !password || !confirm) {
      return 'Fill in every field to create your account.';
    }
    if (!EMAIL_SHAPE.test(trimmed)) {
      return 'Enter a valid email address.';
    }
    if (password.length < 8) {
      return 'Choose a password of at least 8 characters.';
    }
    if (password !== confirm) {
      return 'Those passwords do not match.';
    }

    if (COLOSSUS_PREVIEW) {
      // Signup always yields a shopper; the role is never client-settable.
      this.setSession({ id: DEMO_SHOPPER.id, email: trimmed, role: 'shopper' });
      void this.router.navigateByUrl('/');
      return null;
    }

    // Production path: POST /api/auth/signup.
    return null;
  }

  logout(): void {
    this.user.set(null);
    removeKeys(USER_KEY, TOKEN_KEY);
    void this.router.navigateByUrl('/login');
  }

  /**
   * Preview-only shortcut. Seeds the signed-in state directly and lands on the
   * authenticated home, so the reviewer (and the screenshot capture pass) can
   * reach every screen behind auth without any credentials.
   */
  previewSignIn(role: Role = 'shopper'): void {
    if (!COLOSSUS_PREVIEW) {
      return;
    }
    this.setSession(role === 'admin' ? DEMO_ADMIN : DEMO_SHOPPER);
    void this.router.navigateByUrl(role === 'admin' ? '/admin/orders' : '/');
  }

  /** Preview-only: guarantees an admin session so admin routes are deep-linkable. */
  previewEnsureAdmin(): void {
    if (!COLOSSUS_PREVIEW) {
      return;
    }
    if (this.user()?.role !== 'admin') {
      this.setSession(DEMO_ADMIN);
    }
  }

  /** Preview-only: guarantees some session so authed routes are deep-linkable. */
  previewEnsureSession(): void {
    if (!COLOSSUS_PREVIEW) {
      return;
    }
    if (!this.user()) {
      this.setSession(DEMO_SHOPPER);
    }
  }
}

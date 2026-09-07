import { Injectable, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService, apiErrorMessage } from './api.service';
import { endSession, refreshSessionUser, sessionToken, sessionUser, startSession } from './session';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

/**
 * Live JWT auth against POST /api/auth/{login,signup} and GET /api/auth/me.
 *
 * The cached profile is restored from namespaced storage synchronously (so a
 * cold load of a guarded deep link resolves without a flash of /login) and then
 * re-validated against the server; a rejected token is cleared by the HTTP
 * interceptor.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);

  readonly user = sessionUser;
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => this.user()?.role === 'admin');

  constructor() {
    void this.revalidate();
  }

  /**
   * Confirms the stored token still works and refreshes the cached role, so a
   * server-side role change or a revoked account is picked up on next load.
   * Failures are non-fatal: the interceptor clears an invalid session.
   */
  private async revalidate(): Promise<void> {
    if (!sessionToken()) {
      return;
    }
    try {
      refreshSessionUser(await this.api.me());
    } catch {
      /* interceptor already cleared the session on a 401 */
    }
  }

  /**
   * Returns an error message, or null on success (in which case the caller has
   * already been navigated onward).
   */
  async login(email: string, password: string, redirect?: string | null): Promise<string | null> {
    const trimmed = email.trim();

    if (!trimmed || !password) {
      return 'Enter both your email address and password.';
    }
    if (!EMAIL_SHAPE.test(trimmed)) {
      return 'Enter a valid email address.';
    }

    try {
      const session = await this.api.login(trimmed, password);
      startSession(session.user, session.token);
      void this.router.navigateByUrl(this.safeRedirect(redirect, session.user.role === 'admin'));
      return null;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        return 'Email address or password is incorrect.';
      }
      return apiErrorMessage(error, 'Could not sign you in. Please try again.');
    }
  }

  /** Signup always yields a shopper; the role is never client-settable. */
  async signup(email: string, password: string, confirm: string): Promise<string | null> {
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

    try {
      const session = await this.api.signup(trimmed, password);
      startSession(session.user, session.token);
      void this.router.navigateByUrl('/');
      return null;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        return 'An account with that email address already exists.';
      }
      return apiErrorMessage(error, 'Could not create your account. Please try again.');
    }
  }

  /** The JWT is stateless, so signing out is simply discarding it. */
  logout(): void {
    endSession();
    void this.router.navigateByUrl('/login');
  }

  /**
   * `?redirect=` is attacker-controllable, so only same-origin paths are
   * honoured; anything else falls back to the role's natural landing page.
   */
  private safeRedirect(redirect: string | null | undefined, isAdmin: boolean): string {
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      return redirect;
    }
    return isAdmin ? '/admin/orders' : '/';
  }
}

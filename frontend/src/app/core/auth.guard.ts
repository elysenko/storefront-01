import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Redirects at most once, and never from /login, so a guard/shell redirect
 * loop cannot lock the main thread and blank the page.
 */
export const authGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (COLOSSUS_PREVIEW) {
    auth.previewEnsureSession();
    return true;
  }

  if (auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
};

export const adminGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (COLOSSUS_PREVIEW) {
    auth.previewEnsureAdmin();
    return true;
  }

  return auth.isAdmin() ? true : router.createUrlTree(['/']);
};

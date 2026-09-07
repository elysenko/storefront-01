import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_BASE } from './api.service';
import { endSession, sessionToken } from './session';

/** Endpoints where a 401 is the answer, not an expired session. */
const AUTH_ENTRY = /\/api\/auth\/(login|signup)$/;

/** A 401 here just means "no valid token"; the catalog must stay browsable. */
const SILENT_401 = /\/api\/auth\/me$/;

/**
 * Routes that must never bounce to /login. The root URL in particular has to
 * paint the brand and the product grid for a signed-out visitor, so a stale
 * token expiring in the background can only clear the session — never redirect.
 */
function isPublicUrl(url: string): boolean {
  const path = url.split('?')[0];
  return path === '/' || path === '' || path.startsWith('/products') || path.startsWith('/login') || path.startsWith('/signup');
}

/**
 * Attaches the bearer token to every same-origin `/api` call and tears the
 * session down when the server rejects it, so a expired JWT surfaces as a
 * sign-in prompt instead of a screen full of empty states.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const isApiCall = req.url.startsWith(API_BASE);
  const token = isApiCall ? sessionToken() : null;

  const outbound =
    token && !req.headers.has('Authorization')
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(outbound).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        isApiCall &&
        !AUTH_ENTRY.test(req.url)
      ) {
        endSession();
        if (!SILENT_401.test(req.url) && !isPublicUrl(router.url)) {
          void router.navigate(['/login'], { queryParams: { redirect: router.url } });
        }
      }
      return throwError(() => error);
    }),
  );
};

import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { GoogleIdentityService } from './google-identity.service';

const GOOGLE_AUTH_HOSTS = [
  'https://sheets.googleapis.com/',
  'https://www.googleapis.com/drive/',
  'https://openidconnect.googleapis.com/',
];

export const googleAuthInterceptor: HttpInterceptorFn = (request, next) => {
  const identity = inject(GoogleIdentityService);
  const router = inject(Router);
  const isGoogleResource = GOOGLE_AUTH_HOSTS.some((host) => request.url.startsWith(host));

  return next(request).pipe(catchError((error: unknown) => {
    if (isGoogleResource && error instanceof HttpErrorResponse && error.status === 401) {
      identity.clearSession();
      void router.navigate(['/login'], { queryParams: { reason: 'session-expired' } });
    }
    return throwError(() => error);
  }));
};

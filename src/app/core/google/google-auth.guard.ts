import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { GoogleIdentityService } from './google-identity.service';

function loginUrl(router: Router, returnUrl?: string) {
  return router.createUrlTree(['/login'], { queryParams: returnUrl ? { returnUrl } : undefined });
}

export const googleSessionGuard: CanActivateFn = (_route, state) => {
  const identity = inject(GoogleIdentityService);
  const router = inject(Router);
  return identity.accessToken() ? true : loginUrl(router, state.url);
};

export const googleAuthChildGuard: CanActivateChildFn = async (_route, state) => {
  const identity = inject(GoogleIdentityService);
  const router = inject(Router);
  if (!identity.accessToken()) return loginUrl(router, state.url);

  const validation = await identity.validateAccessToken();
  if (validation === 'valid') return true;
  if (validation === 'unavailable' && identity.hasUsableToken()) return true;
  identity.clearSession();
  return loginUrl(router, state.url);
};

export const signedOutOnlyGuard: CanActivateFn = async () => {
  const identity = inject(GoogleIdentityService);
  const router = inject(Router);
  if (!identity.accessToken()) return true;

  const validation = await identity.validateAccessToken();
  if (validation === 'valid' || (validation === 'unavailable' && identity.hasUsableToken())) {
    return router.createUrlTree(['/dashboard']);
  }
  identity.clearSession();
  return true;
};

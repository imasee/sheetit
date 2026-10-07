import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'tracksee.googleAccessToken';
const TOKEN_EXPIRY_KEY = 'tracksee.googleAccessTokenExpiry';

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  expires_in?: number;
}

export interface GoogleUser {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

export type TokenValidation = 'valid' | 'invalid' | 'unavailable';

interface GoogleTokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface GoogleIdentityApi {
  accounts: {
    oauth2: {
      initTokenClient(options: {
        client_id: string;
        scope: string;
        callback: (response: GoogleTokenResponse) => void;
        error_callback?: (error: unknown) => void;
      }): GoogleTokenClient;
      revoke(token: string, callback?: () => void): void;
    };
  };
}

declare global {
  interface Window { google?: GoogleIdentityApi; }
}

@Injectable({ providedIn: 'root' })
export class GoogleIdentityService {
  private readonly http = inject(HttpClient);
  readonly accessToken = signal<string | null>(this.readToken());
  readonly isConfigured = signal(environment.googleClientId.length > 0 && !environment.googleClientId.startsWith('YOUR_'));
  readonly currentUser = signal<GoogleUser | null>(null);
  private tokenExpiresAt = this.readExpiry();

  async requestAccessToken(prompt?: 'consent' | 'select_account'): Promise<string> {
    const existingToken = this.accessToken();
    if (!prompt && existingToken && this.hasUsableToken()) return existingToken;
    if (!this.isConfigured()) throw new Error('Add your Google OAuth client ID in src/environments/environment.ts.');
    if (!window.google?.accounts.oauth2) throw new Error('Google Identity Services has not loaded. Check your network connection and reload.');

    return new Promise<string>((resolve, reject) => {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: environment.googleClientId,
        scope: environment.scopes.join(' '),
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error ?? 'Google did not return an access token.'));
            return;
          }
          this.accessToken.set(response.access_token);
          this.tokenExpiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;
          this.persistToken(response.access_token, this.tokenExpiresAt);
          resolve(response.access_token);
        },
        error_callback: () => reject(new Error('Google sign-in was closed or could not be completed.')),
      });
      client.requestAccessToken({ prompt: prompt ?? (this.hasStoredGrant() ? '' : 'consent') });
    });
  }

  async signIn(): Promise<GoogleUser> {
    return this.authenticate();
  }

  async signUp(): Promise<GoogleUser> {
    return this.authenticate('select_account');
  }

  private async authenticate(prompt?: 'consent' | 'select_account'): Promise<GoogleUser> {
    await this.requestAccessToken(prompt);
    const validation = await this.validateAccessToken();
    if (validation !== 'valid' || !this.currentUser()) {
      if (validation === 'invalid') this.clearSession();
      throw new Error(validation === 'unavailable'
        ? 'Google could not be reached to verify your account. Check your connection and try again.'
        : 'Google could not validate this sign-in. Please try again.');
    }
    return this.currentUser()!;
  }

  async validateAccessToken(): Promise<TokenValidation> {
    const token = this.accessToken();
    if (!token || !this.hasUsableToken()) return 'invalid';
    try {
      const user = await firstValueFrom(this.http.get<GoogleUser>(
        'https://openidconnect.googleapis.com/v1/userinfo',
        { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) },
      ));
      if (!user.sub) {
        this.clearSession();
        return 'invalid';
      }
      this.currentUser.set(user);
      return 'valid';
    } catch (error) {
      if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
        this.clearSession();
        return 'invalid';
      }
      return 'unavailable';
    }
  }

  hasUsableToken(): boolean {
    return Boolean(this.accessToken() && Date.now() < this.tokenExpiresAt - 15_000);
  }

  clearSession(): void {
    const token = this.accessToken();
    if (token) window.google?.accounts.oauth2.revoke(token);
    this.accessToken.set(null);
    this.currentUser.set(null);
    this.tokenExpiresAt = 0;
    this.persistToken(null, 0);
  }

  private readToken(): string | null {
    try {
      const token = sessionStorage.getItem(TOKEN_KEY);
      const expiry = Number(sessionStorage.getItem(TOKEN_EXPIRY_KEY));
      return token && expiry > Date.now() + 60_000 ? token : null;
    } catch {
      return null;
    }
  }

  private readExpiry(): number {
    try {
      const expiry = Number(sessionStorage.getItem(TOKEN_EXPIRY_KEY));
      return Number.isFinite(expiry) ? expiry : 0;
    } catch {
      return 0;
    }
  }

  private hasStoredGrant(): boolean {
    try { return Boolean(sessionStorage.getItem(TOKEN_KEY)); }
    catch { return false; }
  }

  private persistToken(token: string | null, expiry: number): void {
    try {
      if (token) {
        sessionStorage.setItem(TOKEN_KEY, token);
        sessionStorage.setItem(TOKEN_EXPIRY_KEY, String(expiry));
      } else {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
      }
    } catch {
      // A restricted browser storage policy falls back to this service's in-memory token.
    }
  }
}

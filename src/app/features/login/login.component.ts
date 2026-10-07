import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { GoogleIdentityService } from '../../core/google/google-identity.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'ts-login', standalone: true, imports: [RouterLink, MatIconModule], templateUrl: './login.component.html', styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  readonly appName = environment.appName;
  readonly identity = inject(GoogleIdentityService);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  constructor() {
    const reason = this.route.snapshot.queryParamMap.get('reason');
    if (reason === 'session-expired') this.error.set('Your Google session expired. Sign in again to continue.');
    if (reason === 'signed-out') this.error.set('You have been signed out.');
  }

  async signIn(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.identity.signIn();
      const requested = this.route.snapshot.queryParamMap.get('returnUrl');
      const returnUrl = requested?.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/login')
        ? requested
        : '/dashboard';
      await this.router.navigateByUrl(returnUrl);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Google sign-in failed. Please try again.');
    } finally {
      this.busy.set(false);
    }
  }

}

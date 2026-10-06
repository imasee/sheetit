import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { effect } from '@angular/core';
import { GoogleIdentityService } from './core/google/google-identity.service';
import { TrackseeStore } from './core/store/tracksee.store';

@Component({
  selector: 'ts-root', standalone: true, imports: [RouterOutlet], template: '<router-outlet />',
  styles: [':host { display: block; min-height: 100vh; }'], changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RootComponent {
  private readonly identity = inject(GoogleIdentityService);
  private readonly store = inject(TrackseeStore);

  constructor() {
    effect(() => {
      if (!this.identity.accessToken()) this.store.resetLedger();
    });
  }
}

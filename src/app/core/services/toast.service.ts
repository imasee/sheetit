import { Injectable, signal } from '@angular/core';

export interface ToastMessage { text: string; kind: 'success' | 'error' | 'info'; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly current = signal<ToastMessage | null>(null);
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  show(text: string, kind: ToastMessage['kind'] = 'info'): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.current.set({ text, kind });
    this.dismissTimer = setTimeout(() => this.dismiss(), 5000);
  }

  dismiss(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
    this.dismissTimer = null;
    this.current.set(null);
  }
}

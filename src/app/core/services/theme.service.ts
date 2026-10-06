import { Injectable, signal } from '@angular/core';

export type ThemeName = 'dark-slate' | 'midnight-zinc' | 'clean-light';
const STORAGE_KEY = 'tracksee.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<ThemeName>(this.readTheme());

  constructor() { this.apply(this.theme()); }

  setTheme(theme: ThemeName): void {
    this.theme.set(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    this.apply(theme);
  }

  private readTheme(): ThemeName {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'midnight-zinc' || saved === 'clean-light' ? saved : 'dark-slate';
  }

  private apply(theme: ThemeName): void { document.documentElement.dataset['theme'] = theme; }
}

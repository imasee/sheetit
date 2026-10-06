import { Routes } from '@angular/router';
import { AppComponent } from './app.component';
import { googleAuthChildGuard, googleSessionGuard, signedOutOnlyGuard } from './core/google/google-auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
    canActivate: [signedOutOnlyGuard],
    title: 'Sign in · Tracksee',
  },
  {
    path: '',
    component: AppComponent,
    canActivate: [googleSessionGuard],
    canActivateChild: [googleAuthChildGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent), title: 'Dashboard · Tracksee' },
      { path: 'transactions', loadComponent: () => import('./features/transactions/transactions.component').then((m) => m.TransactionsComponent), title: 'Transactions · Tracksee' },
      { path: 'people', loadComponent: () => import('./features/people/people.component').then((m) => m.PeopleComponent), title: 'People · Tracksee' },
      { path: 'settings', loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent), title: 'Settings · Tracksee' },
    ],
  },
  { path: '**', redirectTo: '' },
];

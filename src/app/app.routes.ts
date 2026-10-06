import { Routes } from '@angular/router';
import { AppComponent } from './app.component';
import { googleAuthChildGuard, googleSessionGuard, signedOutOnlyGuard } from './core/google/google-auth.guard';
import { environment } from '../environments/environment';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
    canActivate: [signedOutOnlyGuard],
    title: `Sign in · ${environment.appName}`,
  },
  {
    path: '',
    component: AppComponent,
    canActivate: [googleSessionGuard],
    canActivateChild: [googleAuthChildGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent), title: `Dashboard · ${environment.appName}` },
      { path: 'transactions', loadComponent: () => import('./features/transactions/transactions.component').then((m) => m.TransactionsComponent), title: `Transactions · ${environment.appName}` },
      { path: 'people', loadComponent: () => import('./features/people/people.component').then((m) => m.PeopleComponent), title: `People · ${environment.appName}` },
      { path: 'settings', loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent), title: `Settings · ${environment.appName}` },
    ],
  },
  { path: '**', redirectTo: '' },
];

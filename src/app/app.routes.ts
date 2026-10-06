import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent), title: 'Dashboard · Tracksee' },
  { path: 'transactions', loadComponent: () => import('./features/transactions/transactions.component').then((m) => m.TransactionsComponent), title: 'Transactions · Tracksee' },
  { path: 'people', loadComponent: () => import('./features/people/people.component').then((m) => m.PeopleComponent), title: 'People · Tracksee' },
  { path: 'settings', loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent), title: 'Settings · Tracksee' },
  { path: '**', redirectTo: 'dashboard' },
];

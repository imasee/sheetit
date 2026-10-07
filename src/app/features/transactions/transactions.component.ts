import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { TransactionDialogComponent } from '../transaction-dialog/transaction-dialog.component';
import { CURRENCIES, Currency, Transaction } from '../../core/models/tracksee.models';
import { TrackseeStore } from '../../core/store/tracksee.store';
import { environment } from '../../../environments/environment';
import { TransactionActionsDialogComponent } from '../transaction-actions-dialog/transaction-actions-dialog.component';
import { TransactionEditDialogComponent } from '../transaction-edit-dialog/transaction-edit-dialog.component';

@Component({ selector: 'ts-transactions', standalone: true, imports: [DatePipe, MatIconModule], templateUrl: './transactions.component.html', styleUrl: './transactions.component.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class TransactionsComponent {
  readonly store = inject(TrackseeStore);
  readonly showLocalComments = environment.showLocalComments;
  readonly currencies = CURRENCIES;
  readonly filter = signal<Currency | 'All'>('All');
  readonly sortKey = signal<'date' | 'amount'>('date');
  readonly sortDirection = signal<'asc' | 'desc'>('desc');
  readonly rows = computed(() => {
    const filter = this.filter();
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    return this.store.transactions()
      .filter((txn) => filter === 'All' || txn.currency === filter)
      .toSorted((a, b) => direction * (this.sortKey() === 'date' ? a.date.localeCompare(b.date) : a.amount - b.amount));
  });
  private readonly dialog = inject(MatDialog);
  formatMoney(value: number, currency: Currency): string { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value); }
  typeLabel(txn: Transaction): string {
    switch (txn.type) {
      case 'Expense': return 'Expense';
      case 'Lent_To_Them': return 'Lent';
      case 'Borrowed_From_Them': return 'Borrowed';
      case 'Repayment_Received': return 'Received';
      case 'Repayment_Sent': return 'Repayment sent';
    }
  }
  typeIcon(txn: Transaction): string {
    switch (txn.type) {
      case 'Expense': return 'shopping_bag';
      case 'Lent_To_Them': return 'north_east';
      case 'Borrowed_From_Them': return 'south_west';
      case 'Repayment_Received': return 'payments';
      case 'Repayment_Sent': return 'payments';
    }
  }
  typeTone(txn: Transaction): string {
    switch (txn.type) {
      case 'Expense': return 'expense';
      case 'Lent_To_Them': return 'lent';
      case 'Borrowed_From_Them': return 'borrowed';
      case 'Repayment_Received': return 'received';
      case 'Repayment_Sent': return 'sent';
    }
  }
  transactionDescription(txn: Transaction): string { return txn.description?.trim() || txn.category?.trim() || '—'; }
  personName(txn: Transaction): string { return txn.type === 'Expense' ? '—' : this.store.getPerson(txn.entityId)?.name ?? 'Unknown person'; }
  setFilter(value: string): void {
    if (value !== 'All' && !this.currencies.includes(value as Currency)) return;
    this.filter.set(value as Currency | 'All');
    if (value === 'All' && this.sortKey() === 'amount') this.sortKey.set('date');
  }
  sortBy(key: 'date' | 'amount'): void {
    if (key === 'amount' && this.filter() === 'All') return;
    if (this.sortKey() === key) this.sortDirection.update((direction) => direction === 'asc' ? 'desc' : 'asc');
    else { this.sortKey.set(key); this.sortDirection.set('desc'); }
  }
  sortIcon(key: 'date' | 'amount'): string { return this.sortKey() === key ? this.sortDirection() === 'asc' ? 'arrow_upward' : 'arrow_downward' : 'unfold_more'; }
  sortAria(key: 'date' | 'amount'): string { return `${key === 'date' ? 'Date' : 'Amount'}, sorted ${this.sortKey() === key ? this.sortDirection() === 'asc' ? 'ascending' : 'descending' : 'not sorted'}`; }
  label(txn: Transaction): string {
    if (txn.type === 'Expense') return txn.category || 'Expense';
    const person = this.store.getPerson(txn.entityId)?.name ?? 'Unknown person';
    return txn.type === 'Lent_To_Them' ? `Lent to ${person}` : txn.type === 'Borrowed_From_Them' ? `Borrowed from ${person}` : txn.type === 'Repayment_Received' ? `Received from ${person}` : `Paid to ${person}`;
  }
  signedAmount(txn: Transaction): number { return txn.type === 'Borrowed_From_Them' || txn.type === 'Repayment_Received' || txn.type === 'Expense' ? -txn.amount : txn.amount; }
  openNew(): void { this.dialog.open(TransactionDialogComponent, { width: 'min(560px, calc(100vw - 32px))', maxWidth: '560px', autoFocus: 'first-tabbable', restoreFocus: true, ariaLabelledBy: 'transaction-dialog-title' }); }
  openEdit(txn: Transaction): void {
    this.dialog.open(TransactionEditDialogComponent, { data: txn, width: 'min(520px, calc(100vw - 32px))', maxWidth: '520px', autoFocus: 'first-tabbable', restoreFocus: true, ariaLabelledBy: 'transaction-edit-title' });
  }
  openActions(txn: Transaction): void {
    this.dialog.open(TransactionActionsDialogComponent, { data: txn, width: 'min(560px, calc(100vw - 32px))', maxWidth: '560px', autoFocus: 'first-tabbable', restoreFocus: true, ariaLabelledBy: 'transaction-actions-title' });
  }
  paid(txn: Transaction): number { return this.store.payments().filter((payment) => payment.txId === txn.txId && payment.status === 'Cleared').reduce((total, payment) => total + payment.amount, 0); }
}

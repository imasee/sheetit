import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { TransactionDialogComponent } from '../transaction-dialog/transaction-dialog.component';
import { CURRENCIES, Currency, Transaction } from '../../core/models/tracksee.models';
import { TrackseeStore } from '../../core/store/tracksee.store';
import { environment } from '../../../environments/environment';

@Component({ selector: 'ts-transactions', standalone: true, imports: [DatePipe, MatIconModule], templateUrl: './transactions.component.html', styleUrl: './transactions.component.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class TransactionsComponent {
  readonly store = inject(TrackseeStore);
  readonly showLocalComments = environment.showLocalComments;
  readonly currencies = CURRENCIES;
  readonly filter = signal<Currency | 'All'>('All');
  readonly rows = computed(() => {
    const filter = this.filter();
    return [...this.store.transactions()].sort((a, b) => b.date.localeCompare(a.date)).filter((txn) => filter === 'All' || txn.currency === filter);
  });
  private readonly dialog = inject(MatDialog);
  formatMoney(value: number, currency: Currency): string { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value); }
  label(txn: Transaction): string {
    if (txn.type === 'Expense') return txn.category || 'Expense';
    const person = this.store.getPerson(txn.entityId)?.name ?? 'Unknown person';
    return txn.type === 'Lent_To_Them' ? `Lent to ${person}` : txn.type === 'Borrowed_From_Them' ? `Borrowed from ${person}` : txn.type === 'Repayment_Received' ? `Received from ${person}` : `Paid to ${person}`;
  }
  signedAmount(txn: Transaction): number { return txn.type === 'Borrowed_From_Them' || txn.type === 'Repayment_Received' || txn.type === 'Expense' ? -txn.amount : txn.amount; }
  openNew(): void { this.dialog.open(TransactionDialogComponent, { width: 'min(560px, calc(100vw - 32px))', maxWidth: '560px', autoFocus: 'first-tabbable', restoreFocus: true, ariaLabelledBy: 'transaction-dialog-title' }); }
}

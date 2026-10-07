import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { CURRENCIES, Currency, Person, PeerPosition, Transaction } from '../../core/models/tracksee.models';
import { environment } from '../../../environments/environment';

export interface PeerBalanceRow extends PeerPosition { person?: Person; }

@Component({
  selector: 'ts-peer-balance-table', standalone: true, imports: [MatIconModule, DatePipe],
  templateUrl: './peer-balance-table.component.html', styleUrl: './peer-balance-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeerBalanceTableComponent {
  readonly entries = input.required<PeerBalanceRow[]>();
  readonly transactions = input<Transaction[]>([]);
  readonly limit = input<number | null>(null);
  readonly allowEdit = input(false);
  readonly allowPersonActions = input(false);
  readonly editPerson = output<Person>();
  readonly archivePerson = output<Person>();
  readonly restorePerson = output<Person>();
  readonly deletePerson = output<Person>();
  readonly currencies = CURRENCIES;
  readonly showLocalComments = environment.showLocalComments;
  readonly expanded = signal<ReadonlySet<string>>(new Set());
  readonly visibleEntries = computed(() => {
    const limit = this.limit();
    return limit === null ? this.entries() : this.entries().slice(0, limit);
  });
  readonly transactionsByPerson = computed(() => {
    const grouped = new Map<string, Transaction[]>();
    for (const txn of this.transactions()) {
      if (!txn.entityId || txn.type === 'Expense') continue;
      const group = grouped.get(txn.entityId) ?? [];
      group.push(txn);
      grouped.set(txn.entityId, group);
    }
    for (const group of grouped.values()) group.sort((a, b) => b.date.localeCompare(a.date));
    return grouped;
  });

  isExpanded(entityId: string): boolean { return this.expanded().has(entityId); }
  hasTransactions(entityId: string): boolean { return this.transactions().some((transaction) => transaction.entityId === entityId); }

  toggle(entityId: string): void {
    this.expanded.update((current) => {
      const next = new Set(current);
      next.has(entityId) ? next.delete(entityId) : next.add(entityId);
      return next;
    });
  }

  formatMoney(value: number, currency: Currency): string {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  }
}

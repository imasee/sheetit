import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TrackseeStore } from '../../core/store/tracksee.store';
import { SpreadsheetWorkspaceService } from '../../core/services/spreadsheet-workspace.service';
import { SpreadsheetDialogComponent } from '../spreadsheet-dialog/spreadsheet-dialog.component';
import { CURRENCIES, Currency, Transaction } from '../../core/models/tracksee.models';
import { PeerBalanceTableComponent } from '../../shared/peer-balance-table/peer-balance-table.component';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'ts-dashboard', standalone: true,
  imports: [MatCardModule, MatIconModule, DatePipe, RouterLink, PeerBalanceTableComponent],
  templateUrl: './dashboard.component.html', styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  readonly store = inject(TrackseeStore);
  readonly workspace = inject(SpreadsheetWorkspaceService);
  readonly currencies = computed(() => {
    const used = new Set(this.store.transactions().map((transaction) => transaction.currency));
    return CURRENCIES.filter((currency) => used.has(currency));
  });
  readonly syncing = signal(false);
  readonly syncError = signal<string | null>(null);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(MatDialog);

  async syncLedger(): Promise<void> {
    if (this.syncing() || this.store.syncStatus() === 'syncing') return;
    this.syncing.set(true);
    this.syncError.set(null);
    try {
      const previousId = this.workspace.active()?.id;
      const found = await this.workspace.discover();
      if (previousId !== this.workspace.active()?.id) this.store.resetLedger();
      if (!this.workspace.active()) {
        if (!found.length) {
          const ref = this.dialog.open(SpreadsheetDialogComponent, {
            width: 'min(500px, calc(100vw - 32px))', maxWidth: '500px', autoFocus: 'first-tabbable',
            restoreFocus: true, ariaLabelledBy: 'spreadsheet-dialog-title', data: { mode: 'offer' },
          });
          const created = await firstValueFrom(ref.afterClosed());
          if (!created) {
            await this.announcer.announce('No spreadsheet was created. The dashboard remains empty.', 'polite');
            return;
          }
        } else if (found.length === 1) {
          this.workspace.select(found[0]);
          this.store.resetLedger();
        } else {
          const message = `Found ${found.length} SheetFi spreadsheets. Select one from the spreadsheet card.`;
          this.syncError.set(message);
          await this.announcer.announce(message, 'assertive');
          return;
        }
      }
      await this.store.sync();
      const message = `Ledger sync complete. ${this.store.transactions().length} transactions and ${this.store.people().length} people loaded.`;
      this.toast.show(message, 'success');
      await this.announcer.announce(message, 'polite');
    } catch (error) {
      this.syncError.set(error instanceof Error ? error.message : 'Ledger sync failed.');
      this.toast.show(this.syncError()!, 'error');
      await this.announcer.announce('Ledger sync failed. Check the connection details in Settings.', 'assertive');
    } finally {
      this.syncing.set(false);
    }
  }

  formatMoney(value: number, currency: Currency): string {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  }

  personName(entityId: string): string { return this.store.getPerson(entityId)?.name ?? 'Unknown person'; }
  transactionLabel(txn: Transaction): string {
    switch (txn.type) {
      case 'Lent_To_Them': return `Lent to ${this.personName(txn.entityId)}`;
      case 'Borrowed_From_Them': return `Borrowed from ${this.personName(txn.entityId)}`;
      case 'Repayment_Received': return `Received from ${this.personName(txn.entityId)}`;
      case 'Repayment_Sent': return `Paid to ${this.personName(txn.entityId)}`;
      case 'Expense': return txn.category || 'Expense';
    }
  }
  signedAmount(txn: Transaction): number {
    return txn.type === 'Borrowed_From_Them' || txn.type === 'Repayment_Received' || txn.type === 'Expense' ? -txn.amount : txn.amount;
  }
}

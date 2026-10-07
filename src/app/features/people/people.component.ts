import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { CURRENCIES, Currency, Person } from '../../core/models/tracksee.models';
import { TrackseeStore } from '../../core/store/tracksee.store';
import { SpreadsheetWorkspaceService } from '../../core/services/spreadsheet-workspace.service';
import { environment } from '../../../environments/environment';
import { PersonDialogComponent } from '../person-dialog/person-dialog.component';
import { PeerBalanceTableComponent, PeerBalanceRow } from '../../shared/peer-balance-table/peer-balance-table.component';
import { PersonStatus } from '../../core/models/tracksee.models';
import { ToastService } from '../../core/services/toast.service';

@Component({ selector: 'ts-people', standalone: true, imports: [MatIconModule, PeerBalanceTableComponent], templateUrl: './people.component.html', styleUrl: './people.component.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class PeopleComponent {
  readonly store = inject(TrackseeStore);
  readonly workspace = inject(SpreadsheetWorkspaceService);
  readonly currencies = CURRENCIES;
  readonly showLocalComments = environment.showLocalComments;
  readonly peopleSearch = signal('');
  readonly balanceFilter = signal<Currency | 'All'>('All');
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  readonly personFilter = signal<PersonStatus | 'All'>('Active');
  readonly peerRows = computed<PeerBalanceRow[]>(() => {
    const positions = new Map(this.store.peerBalances().map((position) => [position.entityId, position.balances]));
    return this.store.people().map((person) => ({
      entityId: person.entityId,
      person,
      balances: positions.get(person.entityId) ?? { CAD: 0, INR: 0, USD: 0 },
    }));
  });
  readonly visiblePeerRows = computed(() => {
    const status = this.personFilter();
    const currency = this.balanceFilter();
    const query = this.peopleSearch().trim().toLocaleLowerCase();
    return this.peerRows().filter(({ person, balances }) => {
      if (status !== 'All' && person?.status !== status) return false;
      if (currency !== 'All' && balances[currency] === 0) return false;
      if (!query || !person) return !query;
      return [person.name, person.email, person.phone, this.showLocalComments ? person.notes : ''].join(' ').toLocaleLowerCase().includes(query);
    });
  });
  readonly activeCount = computed(() => this.store.people().filter((person) => person.status === 'Active').length);
  readonly archivedCount = computed(() => this.store.people().filter((person) => person.status === 'Archived').length);

  openPersonDialog(person?: Person): void {
    this.dialog.open(PersonDialogComponent, {
      width: 'min(520px, calc(100vw - 28px))', maxWidth: '520px', autoFocus: 'first-tabbable',
      restoreFocus: true, ariaLabelledBy: 'person-dialog-title', data: { person },
    });
  }

  formatMoney(value: number, currency: Currency): string { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value); }
  setBalanceFilter(value: string): void { this.balanceFilter.set(value === 'All' || this.currencies.includes(value as Currency) ? value as Currency | 'All' : 'All'); }
  balance(entityId: string, currency: Currency): number { return this.store.peerBalances().find((position) => position.entityId === entityId)?.balances[currency] ?? 0; }

  async archivePerson(person: Person): Promise<void> {
    const historyCount = this.store.transactions().filter((transaction) => transaction.entityId === person.entityId).length;
    const history = historyCount ? ` Their ${historyCount} transaction${historyCount === 1 ? '' : 's'} and linked payments will remain in your ledger.` : '';
    if (!window.confirm(`Archive ${person.name}? They will no longer be available for new transactions.${history}`)) return;
    await this.saveStatus({ ...person, status: 'Archived' }, `${person.name} was archived.`);
  }

  async restorePerson(person: Person): Promise<void> {
    await this.saveStatus({ ...person, status: 'Active' }, `${person.name} is available for new transactions again.`);
  }

  async deletePerson(person: Person): Promise<void> {
    if (this.store.transactions().some((transaction) => transaction.entityId === person.entityId)) {
      this.toast.show('This person has ledger history. Archive them to preserve it.', 'error');
      return;
    }
    if (!window.confirm(`Permanently delete ${person.name}? This cannot be undone.`)) return;
    try {
      await this.store.deletePerson(person.entityId);
      this.toast.show(`${person.name} was deleted.`, 'success');
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : 'Could not delete this person.', 'error');
    }
  }

  private async saveStatus(person: Person, successMessage: string): Promise<void> {
    try {
      await this.store.updatePerson(person);
      this.toast.show(successMessage, 'success');
    } catch (error) {
      this.toast.show(error instanceof Error ? error.message : 'Could not update this person.', 'error');
    }
  }
}

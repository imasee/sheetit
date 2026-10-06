import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Currency, CURRENCIES, GlobalCurrencySummary, LedgerSnapshot, Person, PeerPosition, SyncStatus, Transaction } from '../models/tracksee.models';
import { SheetsService } from '../services/sheets.service';

interface TrackseeState extends LedgerSnapshot {
  syncStatus: SyncStatus;
  error: string | null;
  lastSyncedAt: string | null;
}

const emptyBalances = (): Record<Currency, number> => ({ CAD: 0, INR: 0, USD: 0 });
const emptySummary = (): GlobalCurrencySummary => ({
  CAD: { netPosition: 0, totalPayable: 0, totalReceivable: 0 },
  INR: { netPosition: 0, totalPayable: 0, totalReceivable: 0 },
  USD: { netPosition: 0, totalPayable: 0, totalReceivable: 0 },
});

export const TrackseeStore = signalStore(
  { providedIn: 'root' },
  withState<TrackseeState>({ people: [], transactions: [], syncStatus: 'idle', error: null, lastSyncedAt: null }),
  withComputed(({ people, transactions }) => {
    const peerBalances = computed<PeerPosition[]>(() => {
      const positions = new Map<string, Record<Currency, number>>();
      for (const txn of transactions()) {
        if (txn.status !== 'Cleared' || !txn.entityId || txn.type === 'Expense') continue;
        const balances = positions.get(txn.entityId) ?? emptyBalances();
        const direction = txn.type === 'Lent_To_Them' || txn.type === 'Repayment_Sent' ? 1 : -1;
        balances[txn.currency] += direction * txn.amount;
        positions.set(txn.entityId, balances);
      }
      return Array.from(positions, ([entityId, balances]) => ({ entityId, balances }));
    });

    return {
      peerBalances,
      peersWithPeople: computed(() => {
        const names = new Map(people().map((person) => [person.entityId, person]));
        return peerBalances().map((position) => ({ ...position, person: names.get(position.entityId) }));
      }),
      globalCurrencySummary: computed<GlobalCurrencySummary>(() => {
        const summary = emptySummary();
        for (const position of peerBalances()) {
          for (const currency of CURRENCIES) {
            const balance = position.balances[currency];
            summary[currency].netPosition += balance;
            if (balance > 0) summary[currency].totalReceivable += balance;
            if (balance < 0) summary[currency].totalPayable += Math.abs(balance);
          }
        }
        return summary;
      }),
      recentTransactions: computed(() => [...transactions()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)),
    };
  }),
  withMethods((store, sheets = inject(SheetsService)) => ({
    async sync(): Promise<void> {
      patchState(store, { syncStatus: 'syncing', error: null });
      try {
        await sheets.ensureSchema();
        const [people, transactions] = await Promise.all([sheets.fetchPeople(), sheets.fetchTransactions()]);
        patchState(store, { people, transactions, syncStatus: 'ready', error: null, lastSyncedAt: new Date().toISOString() });
      } catch (error) {
        patchState(store, { syncStatus: 'error', error: error instanceof Error ? error.message : 'Unable to sync the ledger.' });
        throw error;
      }
    },
    async addTransaction(txn: Transaction): Promise<void> {
      patchState(store, { syncStatus: 'syncing', error: null });
      try {
        await sheets.appendTransaction(txn);
        patchState(store, (state) => ({
          transactions: [txn, ...state.transactions], syncStatus: 'ready',
          lastSyncedAt: new Date().toISOString(), error: null,
        }));
      } catch (error) {
        patchState(store, { syncStatus: 'error', error: error instanceof Error ? error.message : 'Unable to save the transaction.' });
        throw error;
      }
    },
    resetLedger(): void {
      patchState(store, { people: [], transactions: [], syncStatus: 'idle', error: null, lastSyncedAt: null });
    },
    getPerson(entityId: string): Person | undefined { return store.people().find((person) => person.entityId === entityId); },
  })),
);

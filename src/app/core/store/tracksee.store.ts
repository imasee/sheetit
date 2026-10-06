import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { Currency, CURRENCIES, GlobalCurrencySummary, LedgerSnapshot, Payment, Person, PeerPosition, SyncStatus, Transaction, TransactionStatus } from '../models/tracksee.models';
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
  withState<TrackseeState>({ people: [], transactions: [], payments: [], syncStatus: 'idle', error: null, lastSyncedAt: null }),
  withComputed(({ people, transactions, payments }) => {
    const peerBalances = computed<PeerPosition[]>(() => {
      const positions = new Map<string, Record<Currency, number>>();
      for (const txn of transactions()) {
        if (txn.status !== 'Cleared' || !txn.entityId || txn.type === 'Expense') continue;
        const balances = positions.get(txn.entityId) ?? emptyBalances();
        const direction = txn.type === 'Lent_To_Them' || txn.type === 'Repayment_Sent' ? 1 : -1;
        balances[txn.currency] += direction * txn.amount;
        positions.set(txn.entityId, balances);
      }
      const txById = new Map(transactions().map((txn) => [txn.txId, txn]));
      for (const payment of payments()) {
        if (payment.status !== 'Cleared') continue;
        const txn = txById.get(payment.txId);
        if (!txn || txn.status !== 'Cleared' || txn.type === 'Expense') continue;
        const balances = positions.get(txn.entityId) ?? emptyBalances();
        balances[payment.currency] += payment.direction === 'Received' ? -payment.amount : payment.amount;
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
        const [people, transactions, payments] = await Promise.all([sheets.fetchPeople(), sheets.fetchTransactions(), sheets.fetchPayments()]);
        patchState(store, { people, transactions, payments, syncStatus: 'ready', error: null, lastSyncedAt: new Date().toISOString() });
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
          transactions: [txn, ...state.transactions], syncStatus: 'ready' as const,
          lastSyncedAt: new Date().toISOString(), error: null,
        }));
      } catch (error) {
        patchState(store, { syncStatus: 'error', error: error instanceof Error ? error.message : 'Unable to save the transaction.' });
        throw error;
      }
    },
    async addPayment(payment: Payment): Promise<void> {
      const transaction = store.transactions().find((item) => item.txId === payment.txId);
      if (!transaction || transaction.type === 'Expense') throw new Error('Payments can only be linked to a peer transaction.');
      const expectedDirection = transaction.type === 'Lent_To_Them' ? 'Received' : 'Sent';
      if (payment.direction !== expectedDirection || payment.currency !== transaction.currency) throw new Error('Payment direction and currency must match the selected transaction.');
      const allocated = store.payments().filter((item) => item.txId === payment.txId && item.status === 'Cleared').reduce((total, item) => total + item.amount, 0);
      if (payment.amount > Math.max(0, transaction.amount - allocated)) throw new Error('Payment exceeds the transaction’s remaining balance.');
      patchState(store, { syncStatus: 'syncing', error: null });
      try {
        await sheets.appendPayment(payment);
        patchState(store, (state) => ({ payments: [...state.payments, payment], syncStatus: 'ready' as const, error: null, lastSyncedAt: new Date().toISOString() }));
      } catch (error) {
        patchState(store, { syncStatus: 'error', error: error instanceof Error ? error.message : 'Unable to save this payment.' });
        throw error;
      }
    },
    async setTransactionStatus(txId: string, status: TransactionStatus): Promise<void> {
      await sheets.updateTransactionStatus(txId, status);
      patchState(store, (state) => ({ transactions: state.transactions.map((item) => item.txId === txId ? { ...item, status } : item), lastSyncedAt: new Date().toISOString() }));
    },
    async addPerson(person: Person): Promise<void> {
      patchState(store, { syncStatus: 'syncing', error: null });
      try {
        await sheets.appendPerson(person);
        patchState(store, (state) => ({ people: [...state.people, person], syncStatus: 'ready' as const, error: null }));
      } catch (error) {
        patchState(store, { syncStatus: 'error', error: error instanceof Error ? error.message : 'Unable to save this person.' });
        throw error;
      }
    },
    async updatePerson(person: Person): Promise<void> {
      patchState(store, { syncStatus: 'syncing', error: null });
      try {
        await sheets.updatePerson(person);
        patchState(store, (state) => ({
          people: state.people.map((existing) => existing.entityId === person.entityId ? person : existing),
          syncStatus: 'ready' as const, error: null,
        }));
      } catch (error) {
        patchState(store, { syncStatus: 'error', error: error instanceof Error ? error.message : 'Unable to update this person.' });
        throw error;
      }
    },
    resetLedger(): void {
      patchState(store, { people: [], transactions: [], payments: [], syncStatus: 'idle', error: null, lastSyncedAt: null });
    },
    getPerson(entityId: string): Person | undefined { return store.people().find((person) => person.entityId === entityId); },
  })),
);

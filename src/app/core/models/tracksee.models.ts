export const CURRENCIES = ['CAD', 'INR', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const TRANSACTION_TYPES = [
  'Expense',
  'Lent_To_Them',
  'Borrowed_From_Them',
  'Repayment_Received',
  'Repayment_Sent',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type TransactionStatus = 'Cleared' | 'Pending' | 'Void';

export interface Person {
  entityId: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
}

export interface Transaction {
  txId: string;
  date: string;
  entityId: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  category: string;
  notes: string;
  status: TransactionStatus;
  createdAt: string;
}

export interface PeerPosition {
  entityId: string;
  /** Positive means owed to you; negative means you owe the person. */
  balances: Record<Currency, number>;
}

export interface CurrencySummary {
  netPosition: number;
  totalPayable: number;
  totalReceivable: number;
}

export type GlobalCurrencySummary = Record<Currency, CurrencySummary>;

export interface LedgerSnapshot {
  people: Person[];
  transactions: Transaction[];
}

export interface TrackseeSpreadsheet {
  id: string;
  title: string;
  ledgerName: string;
  version: number;
}

export type SyncStatus = 'idle' | 'syncing' | 'ready' | 'error';

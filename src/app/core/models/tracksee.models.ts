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
/** Pending entries affect active balances; Cleared and Void entries do not. */
export type TransactionStatus = 'Cleared' | 'Pending' | 'Void';
export type PaymentDirection = 'Received' | 'Sent';

export interface Payment {
  paymentId: string;
  txId: string;
  date: string;
  direction: PaymentDirection;
  amount: number;
  currency: Currency;
  notes: string;
  status: TransactionStatus;
  createdAt: string;
}

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

export interface LedgerPreferences {
  defaultCurrency: Currency;
}

export interface LedgerTransferRecord {
  transaction: Transaction;
  person: Person | null;
  payments: Payment[];
}

export interface LedgerTransferPayload {
  format: 'sheetfi-ledger-export';
  version: 1;
  exportedAt: string;
  records: LedgerTransferRecord[];
}

export interface LedgerImportBundle {
  people: Person[];
  transactions: Transaction[];
  payments: Payment[];
}

export interface LedgerSnapshot {
  people: Person[];
  transactions: Transaction[];
  payments: Payment[];
}

export interface TrackseeSpreadsheet {
  id: string;
  title: string;
  ledgerName: string;
  version: number;
}

export type SyncStatus = 'idle' | 'syncing' | 'ready' | 'error';

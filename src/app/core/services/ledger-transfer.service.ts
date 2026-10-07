import { Injectable, inject } from '@angular/core';
import {
  CURRENCIES, Currency, LedgerImportBundle, LedgerTransferPayload, LedgerTransferRecord,
  Payment, Person, Transaction, TRANSACTION_TYPES, TransactionStatus,
} from '../models/tracksee.models';
import { TrackseeStore } from '../store/tracksee.store';

const CSV_HEADERS = [
  'txId', 'date', 'entityId', 'type', 'amount', 'currency', 'category', 'notes', 'status', 'createdAt',
  'personEntityId', 'personName', 'personPhone', 'personEmail', 'personNotes', 'payments',
] as const;
const STATUSES: readonly TransactionStatus[] = ['Cleared', 'Pending', 'Void'];

@Injectable({ providedIn: 'root' })
export class LedgerTransferService {
  private readonly store = inject(TrackseeStore);

  toJson(): string {
    return JSON.stringify(this.payload(), null, 2);
  }

  toCsv(): string {
    const records = this.payload().records;
    const lines = [CSV_HEADERS.map((field) => this.csvCell(field)).join(',')];
    for (const { transaction, person, payments } of records) {
      const row: string[] = [
        transaction.txId, transaction.date, transaction.entityId, transaction.type, String(transaction.amount), transaction.currency,
        transaction.category, transaction.notes, transaction.status, transaction.createdAt,
        person?.entityId ?? '', person?.name ?? '', person?.phone ?? '', person?.email ?? '', person?.notes ?? '', JSON.stringify(payments),
      ];
      lines.push(row.map((value) => this.csvCell(value)).join(','));
    }
    return lines.join('\r\n');
  }

  parseImport(text: string): LedgerImportBundle {
    const source = text.trim();
    if (!source) throw new Error('Paste a JSON or CSV ledger export first.');
    const records = source.startsWith('{')
      ? this.parseJsonRecords(source)
      : this.parseCsvRecords(source);
    if (!records.length) throw new Error('This export has no transactions to import.');
    return this.toBundle(records);
  }

  private payload(): LedgerTransferPayload {
    const people = new Map(this.store.people().map((person) => [person.entityId, person]));
    const payments = new Map<string, Payment[]>();
    for (const payment of this.store.payments()) {
      const linked = payments.get(payment.txId) ?? [];
      linked.push(payment);
      payments.set(payment.txId, linked);
    }
    const records: LedgerTransferRecord[] = this.store.transactions().map((transaction) => ({
      transaction,
      person: transaction.entityId ? people.get(transaction.entityId) ?? null : null,
      payments: payments.get(transaction.txId) ?? [],
    }));
    return { format: 'sheetfi-ledger-export', version: 1, exportedAt: new Date().toISOString(), records };
  }

  private parseJsonRecords(source: string): LedgerTransferRecord[] {
    let parsed: unknown;
    try { parsed = JSON.parse(source); }
    catch { throw new Error('The pasted text is not valid JSON.'); }
    if (!this.isObject(parsed) || parsed['format'] !== 'sheetfi-ledger-export' || parsed['version'] !== 1 || !Array.isArray(parsed['records'])) {
      throw new Error('This JSON is not a supported SheetFi ledger export.');
    }
    return parsed['records'].map((record, index) => this.normalizeRecord(record, `Record ${index + 1}`));
  }

  private parseCsvRecords(source: string): LedgerTransferRecord[] {
    const rows = this.parseCsv(source);
    if (rows.length < 2) throw new Error('The CSV does not contain any transaction rows.');
    const headers = rows[0].map((header) => header.replace(/^\uFEFF/, '').trim());
    if (new Set(headers).size !== headers.length || CSV_HEADERS.some((header) => !headers.includes(header))) {
      throw new Error('The CSV headers are missing or duplicated. Use a SheetFi CSV export.');
    }
    return rows.slice(1).filter((row) => row.some((value) => value.trim())).map((row, index) => {
      if (row.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${row.length} values; expected ${headers.length}.`);
      const values = Object.fromEntries(headers.map((header, column) => [header, this.unescapeCsvValue(row[column])]));
      let payments: unknown;
      try { payments = JSON.parse(values['payments'] || '[]'); }
      catch { throw new Error(`CSV row ${index + 2} has invalid linked payment data.`); }
      const hasPerson = ['personEntityId', 'personName', 'personPhone', 'personEmail', 'personNotes'].some((field) => Boolean(values[field]));
      return this.normalizeRecord({
        transaction: {
          txId: values['txId'], date: values['date'], entityId: values['entityId'], type: values['type'], amount: values['amount'],
          currency: values['currency'], category: values['category'], notes: values['notes'], status: values['status'], createdAt: values['createdAt'],
        },
        person: hasPerson ? {
          entityId: values['personEntityId'], name: values['personName'], phone: values['personPhone'],
          email: values['personEmail'], notes: values['personNotes'],
        } : null,
        payments,
      }, `CSV row ${index + 2}`);
    });
  }

  private normalizeRecord(input: unknown, label: string): LedgerTransferRecord {
    if (!this.isObject(input) || !this.isObject(input['transaction'])) throw new Error(`${label} is missing its transaction.`);
    const raw = input['transaction'];
    const type = this.readString(raw, 'type', label) as Transaction['type'];
    const currency = this.readString(raw, 'currency', label).toUpperCase() as Currency;
    const amount = Number(raw['amount']);
    const status = (this.optionalString(raw, 'status') || 'Cleared') as TransactionStatus;
    const transaction: Transaction = {
      txId: this.readString(raw, 'txId', label), date: this.readString(raw, 'date', label),
      entityId: this.optionalString(raw, 'entityId'), type, amount, currency,
      category: this.optionalString(raw, 'category'), notes: this.optionalString(raw, 'notes'),
      status, createdAt: this.optionalString(raw, 'createdAt'),
    };
    if (!transaction.txId || !transaction.date || !TRANSACTION_TYPES.includes(type) || !this.isCurrency(currency) || !Number.isFinite(amount) || amount <= 0 || !STATUSES.includes(status)) {
      throw new Error(`${label} has an invalid transaction ID, date, type, amount, currency, or status.`);
    }

    let person: Person | null = null;
    if (input['person'] !== null && input['person'] !== undefined) {
      if (!this.isObject(input['person'])) throw new Error(`${label} has invalid person data.`);
      const rawPerson = input['person'];
      person = {
        entityId: this.readString(rawPerson, 'entityId', label), name: this.readString(rawPerson, 'name', label),
        phone: this.optionalString(rawPerson, 'phone'), email: this.optionalString(rawPerson, 'email'), notes: this.optionalString(rawPerson, 'notes'),
      };
      if (!person.entityId || !person.name) throw new Error(`${label} has a person without an ID or name.`);
    }
    if (type !== 'Expense' && (!person || person.entityId !== transaction.entityId)) {
      throw new Error(`${label} must include the matching person for transaction ${transaction.txId}.`);
    }

    if (!Array.isArray(input['payments'])) throw new Error(`${label} has invalid linked payment data.`);
    const payments = input['payments'].map((rawPayment, paymentIndex) => this.normalizePayment(rawPayment, transaction, `${label}, payment ${paymentIndex + 1}`));
    return { transaction, person, payments };
  }

  private normalizePayment(input: unknown, transaction: Transaction, label: string): Payment {
    if (!this.isObject(input)) throw new Error(`${label} is invalid.`);
    const amount = Number(input['amount']);
    const currency = String(input['currency'] ?? '').toUpperCase() as Currency;
    const direction = this.readString(input, 'direction', label);
    const status = this.readString(input, 'status', label) as TransactionStatus;
    const payment: Payment = {
      paymentId: this.readString(input, 'paymentId', label), txId: this.readString(input, 'txId', label),
      date: this.readString(input, 'date', label), direction: direction as Payment['direction'], amount, currency,
      notes: this.optionalString(input, 'notes'), status, createdAt: this.optionalString(input, 'createdAt'),
    };
    const expectedDirection = transaction.type === 'Lent_To_Them' ? 'Received' : 'Sent';
    if (!payment.paymentId || payment.txId !== transaction.txId || !payment.date || !['Received', 'Sent'].includes(direction) || direction !== expectedDirection ||
      !Number.isFinite(amount) || amount <= 0 || !this.isCurrency(currency) || currency !== transaction.currency || !STATUSES.includes(status) || transaction.type === 'Expense') {
      throw new Error(`${label} does not match its transaction.`);
    }
    return payment;
  }

  private toBundle(records: LedgerTransferRecord[]): LedgerImportBundle {
    const people = new Map<string, Person>();
    const transactions: Transaction[] = [];
    const payments: Payment[] = [];
    const transactionIds = new Set<string>();
    const paymentIds = new Set<string>();
    for (const record of records) {
      if (transactionIds.has(record.transaction.txId)) throw new Error(`Duplicate transaction ID: ${record.transaction.txId}.`);
      transactionIds.add(record.transaction.txId);
      transactions.push(record.transaction);
      if (record.person) {
        const existing = people.get(record.person.entityId);
        if (existing && JSON.stringify(existing) !== JSON.stringify(record.person)) throw new Error(`Person ${record.person.entityId} has conflicting details in the export.`);
        people.set(record.person.entityId, record.person);
      }
      for (const payment of record.payments) {
        if (paymentIds.has(payment.paymentId)) throw new Error(`Duplicate payment ID: ${payment.paymentId}.`);
        paymentIds.add(payment.paymentId);
        payments.push(payment);
      }
    }
    return { people: [...people.values()], transactions, payments };
  }

  private parseCsv(source: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < source.length; index++) {
      const char = source[index];
      if (quoted) {
        if (char === '"' && source[index + 1] === '"') { field += '"'; index++; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"' && field.length === 0) quoted = true;
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && source[index + 1] === '\n') index++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += char;
    }
    if (quoted) throw new Error('The CSV contains an unclosed quoted field.');
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  private csvCell(value: string): string {
    const safe = /^[=+\-@\t\r]/.test(value) || value.startsWith("'") ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  }

  private unescapeCsvValue(value: string): string {
    if (value.startsWith("''")) return value.slice(1);
    if (value.length > 1 && value[0] === "'" && /^[=+\-@\t\r]/.test(value[1])) return value.slice(1);
    return value;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private readString(record: Record<string, unknown>, key: string, label: string): string {
    const value = record[key];
    if (typeof value !== 'string') throw new Error(`${label} is missing ${key}.`);
    return value.trim();
  }

  private optionalString(record: Record<string, unknown>, key: string): string {
    const value = record[key];
    return typeof value === 'string' ? value : '';
  }

  private isCurrency(value: string): value is Currency {
    return (CURRENCIES as readonly string[]).includes(value);
  }
}

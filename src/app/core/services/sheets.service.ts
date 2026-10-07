import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { GoogleIdentityService } from '../google/google-identity.service';
import { SpreadsheetWorkspaceService } from './spreadsheet-workspace.service';
import { CURRENCIES, Currency, LedgerImportBundle, Payment, PaymentDirection, Person, PersonStatus, Transaction, TRANSACTION_TYPES, TransactionStatus } from '../models/tracksee.models';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const PEOPLE_RANGE = 'People!A2:F';
const TRANSACTIONS_RANGE = 'Transactions!A2:K';
const PAYMENTS_RANGE = 'Payments!A2:I';
const SETTINGS_RANGE = 'Settings!A2:B';
const PEOPLE_HEADERS = ['EntityId', 'Name', 'Phone', 'Email', 'Notes', 'Status'];
const TRANSACTION_HEADERS = ['TxId', 'Date', 'EntityId', 'Type', 'Amount', 'Currency', 'Category', 'Notes', 'Status', 'CreatedAt', 'Description'];
const PAYMENT_HEADERS = ['PaymentId', 'TxId', 'Date', 'Direction', 'Amount', 'Currency', 'Notes', 'Status', 'CreatedAt'];
const SETTINGS_HEADERS = ['Setting', 'Value'];
const DEFAULT_CURRENCY_KEY = 'defaultCurrency';

@Injectable({ providedIn: 'root' })
export class SheetsService {
  private readonly http = inject(HttpClient);
  private readonly identity = inject(GoogleIdentityService);
  private readonly workspace = inject(SpreadsheetWorkspaceService);

  async fetchPeople(): Promise<Person[]> {
    const rows = await this.getValues(PEOPLE_RANGE);
    return rows.map((row) => ({
      entityId: this.cell(row, 0), name: this.cell(row, 1), phone: this.cell(row, 2),
      email: this.cell(row, 3), notes: this.cell(row, 4), status: this.readPersonStatus(this.cell(row, 5)),
    })).filter((person) => person.entityId && person.name);
  }

  async fetchTransactions(): Promise<Transaction[]> {
    const rows = await this.getValues(TRANSACTIONS_RANGE);
    return rows.map((row, index) => {
      const type = this.cell(row, 3);
      const currency = this.cell(row, 5);
      const amount = Number(this.cell(row, 4));
      const rowNumber = index + 2;
      if (!this.cell(row, 0) || !this.cell(row, 1) || !this.isTransactionType(type) || !this.isCurrency(currency) || !Number.isFinite(amount) || amount <= 0) {
        throw new Error(`Transactions row ${rowNumber} has a missing ID/date or invalid type, amount, or currency.`);
      }
      if (type !== 'Expense' && !this.cell(row, 2)) {
        throw new Error(`Transactions row ${rowNumber} must include an EntityId for peer activity.`);
      }
      const status = this.cell(row, 8);
      if (status && !this.isStatus(status)) throw new Error(`Transactions row ${rowNumber} has an unsupported status: ${status}.`);
      return {
        txId: this.cell(row, 0), date: this.cell(row, 1), entityId: this.cell(row, 2),
        type, amount, currency, category: this.cell(row, 6), notes: this.cell(row, 7), description: this.cell(row, 10),
        status: this.isStatus(status) ? status : 'Pending', createdAt: this.cell(row, 9),
      };
    });
  }

  async fetchPayments(): Promise<Payment[]> {
    const rows = await this.getValues(PAYMENTS_RANGE);
    return rows.map((row, index) => {
      const amount = Number(this.cell(row, 4));
      const currency = this.cell(row, 5);
      const direction = this.cell(row, 3);
      const status = this.cell(row, 7);
      if (!this.cell(row, 0) || !this.cell(row, 1) || !this.cell(row, 2) || !['Received', 'Sent'].includes(direction) || !this.isCurrency(currency) || !Number.isFinite(amount) || amount <= 0 || !this.isStatus(status)) {
        throw new Error(`Payments row ${index + 2} has invalid payment data.`);
      }
      return { paymentId: this.cell(row, 0), txId: this.cell(row, 1), date: this.cell(row, 2), direction: direction as PaymentDirection, amount, currency, notes: this.cell(row, 6), status, createdAt: this.cell(row, 8) };
    });
  }

  async fetchDefaultCurrency(): Promise<Currency> {
    const rows = await this.getValues(SETTINGS_RANGE);
    const value = rows.find((row) => this.cell(row, 0) === DEFAULT_CURRENCY_KEY)?.[1]?.trim() || 'INR';
    if (!this.isCurrency(value)) throw new Error('Settings defaultCurrency must be CAD, INR, or USD.');
    return value;
  }

  async updateDefaultCurrency(currency: Currency): Promise<void> {
    const rows = await this.getValues(SETTINGS_RANGE);
    const rowIndex = rows.findIndex((row) => this.cell(row, 0) === DEFAULT_CURRENCY_KEY);
    if (rowIndex < 0) {
      await this.appendSetting(DEFAULT_CURRENCY_KEY, currency);
      return;
    }
    await this.updateSettingValue(rowIndex + 2, currency);
  }

  private async updateSettingValue(rowNumber: number, value: string): Promise<void> {
    await firstValueFrom(this.http.put(
      `${SHEETS_API}/${this.requireSpreadsheetId()}/values/${encodeURIComponent(`Settings!B${rowNumber}:B${rowNumber}`)}`,
      { values: [[value]] }, { headers: await this.headers(), params: { valueInputOption: 'RAW' } },
    ));
  }

  async appendTransaction(txn: Transaction): Promise<void> {
    const row = [[txn.txId, txn.date, txn.entityId, txn.type, txn.amount, txn.currency,
      txn.category, txn.notes, txn.status, txn.createdAt, txn.description]];
    await firstValueFrom(this.http.post(
      `${SHEETS_API}/${this.requireSpreadsheetId()}/values/${encodeURIComponent(TRANSACTIONS_RANGE)}:append`,
      { values: row },
      { headers: await this.headers(), params: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' } },
    ));
  }

  async appendPayment(payment: Payment): Promise<void> {
    await firstValueFrom(this.http.post(
      `${SHEETS_API}/${this.requireSpreadsheetId()}/values/${encodeURIComponent(PAYMENTS_RANGE)}:append`,
      { values: [[payment.paymentId, payment.txId, payment.date, payment.direction, payment.amount, payment.currency, payment.notes, payment.status, payment.createdAt]] },
      { headers: await this.headers(), params: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' } },
    ));
  }

  async updateTransactionStatus(txId: string, status: TransactionStatus): Promise<void> {
    const rows = await this.getValues(TRANSACTIONS_RANGE);
    const rowIndex = rows.findIndex((row) => this.cell(row, 0) === txId);
    if (rowIndex < 0) throw new Error('This transaction is no longer in the selected sheet. Sync and try again.');
    const rowNumber = rowIndex + 2;
    await firstValueFrom(this.http.put(
      `${SHEETS_API}/${this.requireSpreadsheetId()}/values/${encodeURIComponent(`Transactions!I${rowNumber}:I${rowNumber}`)}`,
      { values: [[status]] }, { headers: await this.headers(), params: { valueInputOption: 'RAW' } },
    ));
  }

  async appendPerson(person: Person): Promise<void> {
    await firstValueFrom(this.http.post(
      `${SHEETS_API}/${this.requireSpreadsheetId()}/values/${encodeURIComponent(PEOPLE_RANGE)}:append`,
      { values: [[person.entityId, person.name, person.phone, person.email, person.notes, person.status]] },
      { headers: await this.headers(), params: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' } },
    ));
  }

  async updatePerson(person: Person): Promise<void> {
    const rows = await this.getValues(PEOPLE_RANGE);
    const rowIndex = rows.findIndex((row) => this.cell(row, 0) === person.entityId);
    if (rowIndex < 0) throw new Error('This person is no longer in the selected People sheet. Sync and try again.');
    const rowNumber = rowIndex + 2;
    await firstValueFrom(this.http.put(
      `${SHEETS_API}/${this.requireSpreadsheetId()}/values/${encodeURIComponent(`People!A${rowNumber}:F${rowNumber}`)}`,
      { values: [[person.entityId, person.name, person.phone, person.email, person.notes, person.status]] },
      { headers: await this.headers(), params: { valueInputOption: 'RAW' } },
    ));
  }

  async updateTransaction(transaction: Transaction): Promise<void> {
    const rows = await this.getValues(TRANSACTIONS_RANGE);
    const rowIndex = rows.findIndex((row) => this.cell(row, 0) === transaction.txId);
    if (rowIndex < 0) throw new Error('This transaction is no longer in the selected sheet. Sync and try again.');
    const rowNumber = rowIndex + 2;
    await firstValueFrom(this.http.put(
      `${SHEETS_API}/${this.requireSpreadsheetId()}/values/${encodeURIComponent(`Transactions!B${rowNumber}:K${rowNumber}`)}`,
      { values: [[transaction.date, transaction.entityId, transaction.type, transaction.amount, transaction.currency, transaction.category, transaction.notes, transaction.status, transaction.createdAt, transaction.description]] },
      { headers: await this.headers(), params: { valueInputOption: 'RAW' } },
    ));
  }

  async deletePerson(entityId: string): Promise<void> {
    const [people, transactions] = await Promise.all([this.getValues(PEOPLE_RANGE), this.getValues(TRANSACTIONS_RANGE)]);
    if (transactions.some((row) => this.cell(row, 2) === entityId)) {
      throw new Error('This person has ledger history. Archive them to preserve transaction and payment records.');
    }
    const rowIndex = people.findIndex((row) => this.cell(row, 0) === entityId);
    if (rowIndex < 0) throw new Error('This person is no longer in the selected sheet. Sync and try again.');
    const rowNumber = rowIndex + 2;
    await firstValueFrom(this.http.post(
      `${SHEETS_API}/${this.requireSpreadsheetId()}/values:batchClear`,
      { ranges: [`People!A${rowNumber}:F${rowNumber}`] },
      { headers: await this.headers() },
    ));
  }

  async ensureSchema(): Promise<void> {
    const id = this.requireSpreadsheetId();
    const tokenHeaders = await this.headers();
    const metadata = await firstValueFrom(this.http.get<{ sheets?: { properties?: { title?: string } }[] }>(`${SHEETS_API}/${id}`, { headers: tokenHeaders, params: { fields: 'sheets.properties.title' } }));
    const existingTabs = new Set((metadata.sheets ?? []).map((sheet) => sheet.properties?.title));
    const missingTabs = ['Payments', 'Settings'].filter((title) => !existingTabs.has(title));
    if (missingTabs.length) {
      await firstValueFrom(this.http.post(`${SHEETS_API}/${id}:batchUpdate`, {
        requests: missingTabs.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })),
      }, { headers: tokenHeaders }));
    }
    const current = await this.getValues('People!A1:F1').catch(() => []);
    const txnHeaders = await this.getValues('Transactions!A1:K1').catch(() => []);
    const paymentHeaders = await this.getValues('Payments!A1:I1').catch(() => []);
    const settingHeaders = await this.getValues('Settings!A1:B1').catch(() => []);
    const settingRows = await this.getValues(SETTINGS_RANGE).catch(() => []);
    const requests: { range: string; values: string[][] }[] = [];
    this.addPeopleHeaderRequest(current, requests);
    this.addTransactionHeaderRequest(txnHeaders, requests);
    this.addHeaderRequest(paymentHeaders, 'Payments!A1:I1', PAYMENT_HEADERS, requests);
    this.addHeaderRequest(settingHeaders, 'Settings!A1:B1', SETTINGS_HEADERS, requests);
    if (requests.length) {
      await firstValueFrom(this.http.post(`${SHEETS_API}/${this.requireSpreadsheetId()}/values:batchUpdate`, {
        valueInputOption: 'RAW', data: requests,
      }, { headers: await this.headers() }));
    }
    const defaultCurrencyRow = settingRows.findIndex((row) => this.cell(row, 0) === DEFAULT_CURRENCY_KEY);
    if (defaultCurrencyRow < 0) {
      await this.appendSetting(DEFAULT_CURRENCY_KEY, 'INR');
    } else if (!this.cell(settingRows[defaultCurrencyRow], 1)) {
      await this.updateSettingValue(defaultCurrencyRow + 2, 'INR');
    }
  }

  async importJoinedLedger(bundle: LedgerImportBundle): Promise<void> {
    const [peopleRows, transactionRows, paymentRows] = await Promise.all([
      this.getValues(PEOPLE_RANGE),
      this.getValues(TRANSACTIONS_RANGE),
      this.getValues(PAYMENTS_RANGE),
    ]);
    const existingPeople = new Set(peopleRows.map((row) => this.cell(row, 0)).filter(Boolean));
    const existingTransactions = new Set(transactionRows.map((row) => this.cell(row, 0)).filter(Boolean));
    const existingPayments = new Set(paymentRows.map((row) => this.cell(row, 0)).filter(Boolean));
    this.assertNoDuplicateIds('people', bundle.people.map((item) => item.entityId), existingPeople);
    this.assertNoDuplicateIds('transactions', bundle.transactions.map((item) => item.txId), existingTransactions);
    this.assertNoDuplicateIds('payments', bundle.payments.map((item) => item.paymentId), existingPayments);

    const peopleIds = new Set([...existingPeople, ...bundle.people.map((item) => item.entityId)]);
    const transactionById = new Map(bundle.transactions.map((transaction) => [transaction.txId, transaction] as const));
    for (const transaction of bundle.transactions) {
      if (transaction.type !== 'Expense' && !peopleIds.has(transaction.entityId)) {
        throw new Error(`Cannot import transaction ${transaction.txId}: person ${transaction.entityId} is missing.`);
      }
    }
    for (const payment of bundle.payments) {
      const transaction = transactionById.get(payment.txId);
      if (!transaction) throw new Error(`Cannot import payment ${payment.paymentId}: transaction ${payment.txId} is missing from the import.`);
      const expectedDirection = transaction.type === 'Lent_To_Them' ? 'Received' : 'Sent';
      if (transaction.type === 'Expense' || transaction.currency !== payment.currency || payment.direction !== expectedDirection) {
        throw new Error(`Cannot import payment ${payment.paymentId}: its direction or currency does not match its transaction.`);
      }
    }

    const data: { range: string; values: (string | number)[][] }[] = [];
    if (bundle.people.length) data.push({
      range: `People!A${peopleRows.length + 2}:F`,
      values: bundle.people.map((person) => [person.entityId, person.name, person.phone, person.email, person.notes, person.status]),
    });
    if (bundle.transactions.length) data.push({
      range: `Transactions!A${transactionRows.length + 2}:K`,
      values: bundle.transactions.map((txn) => [txn.txId, txn.date, txn.entityId, txn.type, txn.amount, txn.currency, txn.category, txn.notes, txn.status, txn.createdAt, txn.description]),
    });
    if (bundle.payments.length) data.push({
      range: `Payments!A${paymentRows.length + 2}:I`,
      values: bundle.payments.map((payment) => [payment.paymentId, payment.txId, payment.date, payment.direction, payment.amount, payment.currency, payment.notes, payment.status, payment.createdAt]),
    });
    if (!data.length) throw new Error('The import contains no ledger records.');
    await firstValueFrom(this.http.post(
      `${SHEETS_API}/${this.requireSpreadsheetId()}/values:batchUpdate`,
      { valueInputOption: 'RAW', data },
      { headers: await this.headers() },
    ));
  }

  async updatePayment(payment: Payment): Promise<void> {
    const rows = await this.getValues(PAYMENTS_RANGE);
    const rowIndex = rows.findIndex((row) => this.cell(row, 0) === payment.paymentId);
    if (rowIndex < 0) throw new Error('This payment is no longer in the selected sheet. Sync and try again.');
    const rowNumber = rowIndex + 2;
    await firstValueFrom(this.http.put(
      `${SHEETS_API}/${this.requireSpreadsheetId()}/values/${encodeURIComponent(`Payments!A${rowNumber}:I${rowNumber}`)}`,
      { values: [[payment.paymentId, payment.txId, payment.date, payment.direction, payment.amount, payment.currency, payment.notes, payment.status, payment.createdAt]] },
      { headers: await this.headers(), params: { valueInputOption: 'RAW' } },
    ));
  }

  async updateTransactionsStatus(txIds: string[], status: TransactionStatus): Promise<void> {
    if (!txIds.length) return;
    const rows = await this.getValues(TRANSACTIONS_RANGE);
    const rowById = new Map(rows.map((row, index) => [this.cell(row, 0), index + 2]));
    const missing = txIds.filter((txId) => !rowById.has(txId));
    if (missing.length) throw new Error('Some transactions are no longer in the selected sheet. Sync and try again.');
    const data = txIds.map((txId) => ({ range: `Transactions!I${rowById.get(txId)}:I${rowById.get(txId)}`, values: [[status]] }));
    await firstValueFrom(this.http.post(
      `${SHEETS_API}/${this.requireSpreadsheetId()}/values:batchUpdate`,
      { valueInputOption: 'RAW', data },
      { headers: await this.headers() },
    ));
  }

  private async appendSetting(key: string, value: string): Promise<void> {
    await firstValueFrom(this.http.post(
      `${SHEETS_API}/${this.requireSpreadsheetId()}/values/${encodeURIComponent(SETTINGS_RANGE)}:append`,
      { values: [[key, value]] },
      { headers: await this.headers(), params: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' } },
    ));
  }

  private assertNoDuplicateIds(kind: string, importedIds: string[], existingIds: Set<string>): void {
    const seen = new Set<string>();
    for (const id of importedIds) {
      if (!id || seen.has(id) || existingIds.has(id)) {
        throw new Error(`Import stopped: ${kind} contain a missing or duplicate ID (${id || 'blank'}).`);
      }
      seen.add(id);
    }
  }

  private async getValues(range: string): Promise<string[][]> {
    const response = await firstValueFrom(this.http.get<{ values?: unknown[][] }>(
      `${SHEETS_API}/${this.requireSpreadsheetId()}/values/${encodeURIComponent(range)}`,
      { headers: await this.headers(), params: { majorDimension: 'ROWS' } },
    ));
    return (response.values ?? []).map((row) => row.map((value) => String(value ?? '')));
  }

  private async headers(): Promise<HttpHeaders> {
    const token = await this.identity.requestAccessToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private requireSpreadsheetId(): string {
    const spreadsheetId = this.workspace.active()?.id;
    if (!spreadsheetId) throw new Error('Choose a SheetFi spreadsheet before syncing.');
    return spreadsheetId;
  }

  private cell(row: string[], index: number): string { return row[index]?.trim() ?? ''; }
  private addHeaderRequest(
    rows: string[][],
    range: string,
    expected: string[],
    requests: { range: string; values: string[][] }[],
  ): void {
    if (!rows.length || !rows[0]?.some((cell) => cell.trim())) {
      requests.push({ range, values: [expected] });
      return;
    }
    if (expected.some((header, index) => rows[0]?.[index]?.trim() !== header)) {
      throw new Error(`${range.split('!')[0]} has unexpected column headers. Use the SheetFi schema listed in Settings.`);
    }
  }
  private addPeopleHeaderRequest(rows: string[][], requests: { range: string; values: string[][] }[]): void {
    if (!rows.length || !rows[0]?.some((cell) => cell.trim())) {
      requests.push({ range: 'People!A1:F1', values: [PEOPLE_HEADERS] });
      return;
    }
    if (PEOPLE_HEADERS.slice(0, 5).some((header, index) => rows[0]?.[index]?.trim() !== header)) {
      throw new Error('People has unexpected column headers. Use the SheetFi schema listed in Settings.');
    }
    const statusHeader = rows[0]?.[5]?.trim();
    if (!statusHeader) requests.push({ range: 'People!F1', values: [['Status']] });
    else if (statusHeader !== 'Status') throw new Error('People has unexpected column headers. Use the SheetFi schema listed in Settings.');
  }
  private addTransactionHeaderRequest(rows: string[][], requests: { range: string; values: string[][] }[]): void {
    if (!rows.length || !rows[0]?.some((cell) => cell.trim())) {
      requests.push({ range: 'Transactions!A1:K1', values: [TRANSACTION_HEADERS] });
      return;
    }
    if (TRANSACTION_HEADERS.slice(0, 10).some((header, index) => rows[0]?.[index]?.trim() !== header)) {
      throw new Error('Transactions has unexpected column headers. Use the SheetFi schema listed in Settings.');
    }
    const descriptionHeader = rows[0]?.[10]?.trim();
    if (!descriptionHeader) requests.push({ range: 'Transactions!K1', values: [['Description']] });
    else if (descriptionHeader !== 'Description') throw new Error('Transactions has unexpected column headers. Use the SheetFi schema listed in Settings.');
  }
  private isCurrency(value: string): value is Currency { return (CURRENCIES as readonly string[]).includes(value); }
  private isTransactionType(value: string): value is Transaction['type'] { return (TRANSACTION_TYPES as readonly string[]).includes(value); }
  private isStatus(value: string): value is TransactionStatus { return ['Cleared', 'Pending', 'Void'].includes(value); }
  private readPersonStatus(value: string): PersonStatus {
    if (!value) return 'Active';
    if (value === 'Active' || value === 'Archived') return value;
    throw new Error(`People has an unsupported status: ${value}.`);
  }
}

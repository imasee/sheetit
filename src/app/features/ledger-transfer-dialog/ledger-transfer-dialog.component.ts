import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { LedgerImportBundle } from '../../core/models/tracksee.models';
import { LedgerTransferService } from '../../core/services/ledger-transfer.service';
import { SheetsService } from '../../core/services/sheets.service';
import { SpreadsheetWorkspaceService } from '../../core/services/spreadsheet-workspace.service';
import { ToastService } from '../../core/services/toast.service';
import { TrackseeStore } from '../../core/store/tracksee.store';

@Component({
  selector: 'ts-ledger-transfer-dialog', standalone: true, imports: [MatDialogModule, MatIconModule],
  templateUrl: './ledger-transfer-dialog.component.html', styleUrl: './ledger-transfer-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LedgerTransferDialogComponent {
  readonly store = inject(TrackseeStore);
  readonly workspace = inject(SpreadsheetWorkspaceService);
  private readonly transfer = inject(LedgerTransferService);
  private readonly sheets = inject(SheetsService);
  private readonly dialogRef = inject(MatDialogRef<LedgerTransferDialogComponent>);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly toast = inject(ToastService);
  readonly importText = signal('');
  readonly preview = signal<LedgerImportBundle | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);
  readonly counts = computed(() => {
    const bundle = this.preview();
    return bundle ? { people: bundle.people.length, transactions: bundle.transactions.length, payments: bundle.payments.length } : null;
  });

  download(format: 'json' | 'csv'): void {
    if (!this.canExport()) return;
    try {
      const content = this.exportContent(format);
      const mime = format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8';
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.fileBaseName()}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      const message = `Ledger exported as ${format.toUpperCase()}.`;
      this.message.set(message);
      this.toast.show(message, 'success');
      void this.announcer.announce(message, 'polite');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not export this ledger.');
    }
  }

  async copyToClipboard(format: 'json' | 'csv'): Promise<void> {
    if (!this.canExport()) return;
    this.error.set(null);
    this.message.set(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable. Use the download option instead.');
      await navigator.clipboard.writeText(this.exportContent(format));
      const message = `${format.toUpperCase()} ledger data copied to the clipboard.`;
      this.message.set(message);
      this.toast.show(message, 'success');
      await this.announcer.announce(message, 'polite');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not copy ledger data to the clipboard.');
    }
  }

  onImportText(event: Event): void {
    this.importText.set((event.target as HTMLTextAreaElement).value);
    this.preview.set(null);
    this.error.set(null);
    this.message.set(null);
  }

  inspectImport(): void {
    this.preview.set(null);
    this.error.set(null);
    try {
      this.preview.set(this.transfer.parseImport(this.importText()));
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not read this import.');
    }
  }

  async importLedger(): Promise<void> {
    const bundle = this.preview();
    if (!bundle || !this.workspace.active() || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.message.set(null);
    let wasWritten = false;
    try {
      await this.sheets.importJoinedLedger(bundle);
      wasWritten = true;
      await this.store.sync();
      const message = `Imported ${bundle.transactions.length} transactions, ${bundle.people.length} people, and ${bundle.payments.length} payments.`;
      this.toast.show(message, 'success');
      await this.announcer.announce(message, 'polite');
      this.dialogRef.close(true);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Please try again.';
      this.error.set(wasWritten ? `The data was written, but the refresh failed: ${detail}` : detail);
    } finally {
      this.busy.set(false);
    }
  }

  canExport(): boolean {
    return Boolean(this.workspace.active()) && this.store.syncStatus() === 'ready' && !this.busy();
  }

  private fileBaseName(): string {
    const name = this.workspace.active()?.ledgerName ?? 'ledger';
    const safe = name.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return `sheetfi-${safe || 'ledger'}-${new Date().toISOString().slice(0, 10)}`;
  }

  private exportContent(format: 'json' | 'csv'): string {
    return format === 'json' ? this.transfer.toJson() : this.transfer.toCsv();
  }
}

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GoogleIdentityService } from '../../core/google/google-identity.service';
import { ThemeName, ThemeService } from '../../core/services/theme.service';
import { SpreadsheetWorkspaceService } from '../../core/services/spreadsheet-workspace.service';
import { TrackseeStore } from '../../core/store/tracksee.store';
import { CURRENCIES } from '../../core/models/tracksee.models';
import { SpreadsheetDialogComponent, SpreadsheetDialogData } from '../spreadsheet-dialog/spreadsheet-dialog.component';
import { LedgerTransferDialogComponent } from '../ledger-transfer-dialog/ledger-transfer-dialog.component';
import { environment } from '../../../environments/environment';

@Component({ selector: 'ts-settings', standalone: true, imports: [MatIconModule], templateUrl: './settings.component.html', styleUrl: './settings.component.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class SettingsComponent {
  readonly store = inject(TrackseeStore);
  readonly themeService = inject(ThemeService);
  readonly identity = inject(GoogleIdentityService);
  readonly workspace = inject(SpreadsheetWorkspaceService);
  readonly clientReady = this.identity.isConfigured;
  readonly namingPattern = environment.spreadsheetNamingPattern;
  readonly currencies = CURRENCIES;
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);
  readonly currencySaving = signal(false);
  readonly currencyMessage = signal<string | null>(null);
  readonly currencyMessageIsError = signal(false);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  readonly themes: { id: ThemeName; name: string; description: string }[] = [
    { id: 'dark-slate', name: 'Dark Slate', description: 'Quiet graphite surfaces' },
    { id: 'midnight-zinc', name: 'Midnight Zinc', description: 'Deep neutral contrast' },
    { id: 'clean-light', name: 'Clean Light', description: 'Soft paper and ink' },
  ];

  async connectOrSync(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.message.set(null);
    try {
      const previousId = this.workspace.active()?.id;
      const found = await this.workspace.discover();
      if (previousId !== this.workspace.active()?.id) this.store.resetLedger();
      if (!found.length) {
        await this.openSpreadsheetDialog('offer');
      } else if (!this.workspace.active() && found.length === 1) {
        this.workspace.select(found[0]);
        await this.syncSelected();
      } else if (!this.workspace.active()) {
        this.message.set(`Found ${found.length} SheetFi spreadsheets. Choose one in the spreadsheet selector.`);
      } else {
        await this.syncSelected();
      }
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Could not connect to Google Sheets.');
    } finally { this.busy.set(false); }
  }

  async selectSpreadsheet(id: string): Promise<void> {
    this.workspace.select(this.workspace.available().find((item) => item.id === id) ?? null);
    this.store.resetLedger();
    if (this.workspace.active()) await this.syncSelected();
  }

  async createSpreadsheet(): Promise<void> { await this.openSpreadsheetDialog('new'); }

  openLedgerTransfer(): void {
    this.dialog.open(LedgerTransferDialogComponent, {
      width: 'min(680px, calc(100vw - 28px))', maxWidth: '680px', autoFocus: 'first-tabbable',
      restoreFocus: true, ariaLabelledBy: 'ledger-transfer-title',
    });
  }

  async updateDefaultCurrency(value: string): Promise<void> {
    const currency = CURRENCIES.find((item) => item === value);
    if (!currency || this.currencySaving() || !this.workspace.active()) return;
    this.currencySaving.set(true);
    this.currencyMessage.set(null);
    this.currencyMessageIsError.set(false);
    try {
      await this.store.setDefaultCurrency(currency);
      this.currencyMessage.set(`New entries will use ${currency} by default.`);
    } catch (error) {
      this.currencyMessageIsError.set(true);
      this.currencyMessage.set(error instanceof Error ? error.message : 'Could not save the default currency.');
    } finally {
      this.currencySaving.set(false);
    }
  }

  async signOut(): Promise<void> {
    this.identity.clearSession();
    this.store.resetLedger();
    await this.router.navigate(['/login'], { queryParams: { reason: 'signed-out' } });
  }

  private async syncSelected(): Promise<void> {
    this.store.resetLedger();
    try {
      await this.store.sync();
      this.message.set(`Synced ${this.workspace.active()?.ledgerName ?? 'spreadsheet'}.`);
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : 'Could not sync this spreadsheet.');
    }
  }

  private async openSpreadsheetDialog(mode: SpreadsheetDialogData['mode']): Promise<void> {
    const ref = this.dialog.open(SpreadsheetDialogComponent, {
      width: 'min(500px, calc(100vw - 32px))', maxWidth: '500px', autoFocus: 'first-tabbable', restoreFocus: true,
      ariaLabelledBy: 'spreadsheet-dialog-title', data: { mode },
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (result) await this.syncSelected();
  }
}

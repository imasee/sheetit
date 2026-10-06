import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { TransactionDialogComponent } from './features/transaction-dialog/transaction-dialog.component';
import { SpreadsheetDialogComponent, SpreadsheetDialogData } from './features/spreadsheet-dialog/spreadsheet-dialog.component';
import { ThemeService } from './core/services/theme.service';
import { TrackseeStore } from './core/store/tracksee.store';
import { SpreadsheetWorkspaceService } from './core/services/spreadsheet-workspace.service';
import { GoogleIdentityService } from './core/google/google-identity.service';

@Component({
  selector: 'ts-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  readonly themeService = inject(ThemeService);
  readonly store = inject(TrackseeStore);
  readonly workspace = inject(SpreadsheetWorkspaceService);
  readonly identity = inject(GoogleIdentityService);
  readonly connectionBusy = signal(false);
  readonly connectionError = signal<string | null>(null);
  private readonly dialog = inject(MatDialog);
  readonly navItems = [
    { label: 'Overview', icon: 'space_dashboard', route: '/dashboard' },
    { label: 'Transactions', icon: 'receipt_long', route: '/transactions' },
    { label: 'People', icon: 'group', route: '/people' },
  ];

  openNewTransaction(): void {
    if (!this.workspace.active()) {
      void this.connectOrSync();
      return;
    }
    this.dialog.open(TransactionDialogComponent, {
      width: 'min(560px, calc(100vw - 32px))', maxWidth: '560px', autoFocus: 'first-tabbable',
      restoreFocus: true, ariaLabelledBy: 'transaction-dialog-title',
    });
  }

  async connectOrSync(): Promise<void> {
    if (this.connectionBusy()) return;
    this.connectionBusy.set(true);
    this.connectionError.set(null);
    try {
      const previousId = this.workspace.active()?.id;
      const found = await this.workspace.discover();
      if (previousId !== this.workspace.active()?.id) this.store.resetLedger();
      if (!found.length) {
        await this.openSpreadsheetDialog('offer');
        return;
      }
      if (!this.workspace.active() && found.length === 1) this.workspace.select(found[0]);
      if (!this.workspace.active()) {
        this.connectionError.set(`Found ${found.length} Tracksee spreadsheets. Select one above.`);
        return;
      }
      await this.syncSelected();
    } catch (error) {
      this.connectionError.set(error instanceof Error ? error.message : 'Could not connect to Google Sheets.');
    } finally {
      this.connectionBusy.set(false);
    }
  }

  async selectSpreadsheet(id: string): Promise<void> {
    const selected = this.workspace.available().find((item) => item.id === id) ?? null;
    this.workspace.select(selected);
    this.store.resetLedger();
    if (selected) await this.syncSelected();
  }

  async openNewSpreadsheet(): Promise<void> {
    await this.openSpreadsheetDialog('new');
  }

  async signOut(): Promise<void> {
    this.identity.clearSession();
    this.connectionError.set('Google session cleared. Your selected spreadsheet is saved for next time.');
  }

  private async syncSelected(): Promise<void> {
    if (!this.workspace.active()) return;
    this.connectionBusy.set(true);
    this.connectionError.set(null);
    this.store.resetLedger();
    try {
      await this.store.sync();
    } catch (error) {
      this.connectionError.set(error instanceof Error ? error.message : 'Could not sync this spreadsheet.');
    } finally {
      this.connectionBusy.set(false);
    }
  }

  private async openSpreadsheetDialog(mode: SpreadsheetDialogData['mode']): Promise<void> {
    const ref = this.dialog.open(SpreadsheetDialogComponent, {
      width: 'min(500px, calc(100vw - 32px))', maxWidth: '500px', autoFocus: 'first-tabbable',
      restoreFocus: true, ariaLabelledBy: 'spreadsheet-dialog-title', data: { mode },
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (result) await this.syncSelected();
  }
}

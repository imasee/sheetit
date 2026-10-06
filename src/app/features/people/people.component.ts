import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { CURRENCIES, Currency, Person } from '../../core/models/tracksee.models';
import { TrackseeStore } from '../../core/store/tracksee.store';
import { SpreadsheetWorkspaceService } from '../../core/services/spreadsheet-workspace.service';
import { environment } from '../../../environments/environment';
import { PersonDialogComponent } from '../person-dialog/person-dialog.component';

@Component({ selector: 'ts-people', standalone: true, imports: [MatIconModule], templateUrl: './people.component.html', styleUrl: './people.component.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class PeopleComponent {
  readonly store = inject(TrackseeStore);
  readonly workspace = inject(SpreadsheetWorkspaceService);
  readonly currencies = CURRENCIES;
  readonly showLocalComments = environment.showLocalComments;
  private readonly dialog = inject(MatDialog);

  openPersonDialog(person?: Person): void {
    this.dialog.open(PersonDialogComponent, {
      width: 'min(520px, calc(100vw - 28px))', maxWidth: '520px', autoFocus: 'first-tabbable',
      restoreFocus: true, ariaLabelledBy: 'person-dialog-title', data: { person },
    });
  }

  formatMoney(value: number, currency: Currency): string { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value); }
  balance(entityId: string, currency: Currency): number { return this.store.peerBalances().find((position) => position.entityId === entityId)?.balances[currency] ?? 0; }
}

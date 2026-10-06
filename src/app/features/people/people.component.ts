import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CURRENCIES, Currency } from '../../core/models/tracksee.models';
import { TrackseeStore } from '../../core/store/tracksee.store';

@Component({ selector: 'ts-people', standalone: true, imports: [MatIconModule], templateUrl: './people.component.html', styleUrl: './people.component.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class PeopleComponent {
  readonly store = inject(TrackseeStore);
  readonly currencies = CURRENCIES;
  formatMoney(value: number, currency: Currency): string { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value); }
  balance(entityId: string, currency: Currency): number { return this.store.peerBalances().find((position) => position.entityId === entityId)?.balances[currency] ?? 0; }
}

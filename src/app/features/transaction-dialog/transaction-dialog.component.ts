import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CURRENCIES, TRANSACTION_TYPES, Currency, Transaction, TransactionType } from '../../core/models/tracksee.models';
import { TrackseeStore } from '../../core/store/tracksee.store';

@Component({
  selector: 'ts-transaction-dialog', standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatIconModule],
  templateUrl: './transaction-dialog.component.html', styleUrl: './transaction-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionDialogComponent {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly dialogRef = inject(MatDialogRef<TransactionDialogComponent>);
  readonly store = inject(TrackseeStore);
  readonly currencies = CURRENCIES;
  readonly types = TRANSACTION_TYPES;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = this.fb.group({
    type: this.fb.control<TransactionType>('Lent_To_Them', Validators.required),
    entityId: this.fb.control(''),
    amount: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0.01)] }),
    currency: this.fb.control<Currency>('INR', Validators.required),
    date: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required),
    category: this.fb.control(''),
    notes: this.fb.control(''),
  });

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const values = this.form.getRawValue();
    if (values.type !== 'Expense' && !values.entityId) {
      this.error.set('Select a person before saving this peer transaction.');
      return;
    }
    const txn: Transaction = {
      txId: crypto.randomUUID(), date: values.date, entityId: values.type === 'Expense' ? '' : values.entityId,
      type: values.type, amount: Number(values.amount), currency: values.currency,
      category: values.category.trim(), notes: values.notes.trim(), status: 'Cleared', createdAt: new Date().toISOString(),
    };
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.store.addTransaction(txn);
      this.dialogRef.close(txn);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not save this transaction.');
    } finally {
      this.saving.set(false);
    }
  }
}

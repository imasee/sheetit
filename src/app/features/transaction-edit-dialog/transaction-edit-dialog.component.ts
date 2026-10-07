import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Transaction, TransactionStatus } from '../../core/models/tracksee.models';
import { TrackseeStore } from '../../core/store/tracksee.store';
import { ThousandsSeparatorDirective } from '../../shared/directives/thousands-separator.directive';
import { DateFieldComponent } from '../../shared/date-field/date-field.component';

@Component({
  selector: 'ts-transaction-edit-dialog', standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule, ThousandsSeparatorDirective, DateFieldComponent],
  templateUrl: './transaction-edit-dialog.component.html', styleUrl: './transaction-edit-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionEditDialogComponent {
  readonly transaction = inject<Transaction>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly store = inject(TrackseeStore);
  private readonly dialogRef = inject(MatDialogRef<TransactionEditDialogComponent>);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly statuses: TransactionStatus[] = ['Pending', 'Cleared', 'Void'];
  readonly form = this.fb.group({
    amount: new FormControl<number | null>(this.transaction.amount, [Validators.required, Validators.min(0.01)]),
    date: this.fb.control(this.transaction.date, Validators.required),
    status: this.fb.control<TransactionStatus>(this.transaction.status, Validators.required),
    description: this.fb.control(this.transaction.description ?? '', Validators.maxLength(200)),
  });

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const { amount, date, status, description } = this.form.getRawValue();
    if (status === 'Cleared' && this.transaction.status !== 'Cleared' && !window.confirm('Mark this transaction cleared? Only do this after confirming it is settled.')) return;
    if (status === 'Void' && this.transaction.status !== 'Void' && !window.confirm('Remove this transaction from active balances? It will remain in your ledger history.')) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.store.updateTransaction({ ...this.transaction, amount: Number(amount), date, status, description: description.trim() });
      this.dialogRef.close(true);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not update this transaction.');
    } finally {
      this.saving.set(false);
    }
  }
}

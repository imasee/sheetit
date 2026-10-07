import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { CURRENCIES, Currency, Person, Transaction, TransactionType } from '../../core/models/tracksee.models';
import { TrackseeStore } from '../../core/store/tracksee.store';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'ts-transaction-dialog', standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule],
  templateUrl: './transaction-dialog.component.html', styleUrl: './transaction-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionDialogComponent {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly dialogRef = inject(MatDialogRef<TransactionDialogComponent>);
  readonly store = inject(TrackseeStore);
  readonly showLocalComments = environment.showLocalComments;
  readonly currencies = CURRENCIES;
  readonly types: TransactionType[] = ['Expense', 'Lent_To_Them', 'Borrowed_From_Them'];
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly personMode = signal<'existing' | 'new'>(this.store.people().length ? 'existing' : 'new');
  readonly form = this.fb.group({
    type: this.fb.control<TransactionType>('Lent_To_Them', Validators.required),
    entityId: this.fb.control(''),
    newPersonName: this.fb.control('', Validators.maxLength(100)),
    newPersonPhone: this.fb.control('', Validators.maxLength(40)),
    newPersonEmail: this.fb.control('', Validators.email),
    newPersonNotes: this.fb.control(''),
    amount: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(0.01)] }),
    currency: this.fb.control<Currency>(this.store.defaultCurrency(), Validators.required),
    date: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required),
    category: this.fb.control(''),
    notes: this.fb.control(''),
  });

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.saving()) return;
    const values = this.form.getRawValue();
    const requiredFieldsInvalid = this.form.controls.type.invalid || this.form.controls.amount.invalid ||
      this.form.controls.currency.invalid || this.form.controls.date.invalid;
    if (requiredFieldsInvalid) return;
    if (values.type !== 'Expense' && this.personMode() === 'new' &&
      (this.form.controls.newPersonName.invalid || this.form.controls.newPersonPhone.invalid || this.form.controls.newPersonEmail.invalid)) return;
    if (values.type !== 'Expense' && this.personMode() === 'existing' && !values.entityId) {
      this.error.set('Select an existing person or add a new one.');
      return;
    }
    if (values.type !== 'Expense' && this.personMode() === 'new' && !values.newPersonName.trim()) {
      this.error.set('Enter the new person’s name to continue.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      let entityId = values.type === 'Expense' ? '' : values.entityId;
      if (values.type !== 'Expense' && this.personMode() === 'new') {
        const person: Person = {
          entityId: crypto.randomUUID(), name: values.newPersonName.trim(), phone: values.newPersonPhone.trim(),
          email: values.newPersonEmail.trim(), notes: this.showLocalComments ? values.newPersonNotes.trim() : '',
        };
        await this.store.addPerson(person);
        entityId = person.entityId;
        this.form.controls.entityId.setValue(person.entityId);
        this.personMode.set('existing');
      }
      const txn: Transaction = {
        txId: crypto.randomUUID(), date: values.date, entityId,
        type: values.type, amount: Number(values.amount), currency: values.currency,
        category: values.category.trim(), notes: values.notes.trim(), status: 'Pending', createdAt: new Date().toISOString(),
      };
      await this.store.addTransaction(txn);
      this.dialogRef.close(txn);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not save this transaction.');
    } finally {
      this.saving.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Payment, Transaction } from '../../core/models/tracksee.models';
import { ToastService } from '../../core/services/toast.service';
import { TrackseeStore } from '../../core/store/tracksee.store';
import { ThousandsSeparatorDirective } from '../../shared/directives/thousands-separator.directive';
import { DateFieldComponent } from '../../shared/date-field/date-field.component';

@Component({ selector: 'ts-transaction-actions-dialog', standalone: true, imports: [DecimalPipe, ReactiveFormsModule, MatDialogModule, MatIconModule, ThousandsSeparatorDirective, DateFieldComponent], templateUrl: './transaction-actions-dialog.component.html', styleUrl: './transaction-actions-dialog.component.scss', changeDetection: ChangeDetectionStrategy.OnPush })
export class TransactionActionsDialogComponent {
  readonly transaction = inject<Transaction>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly store = inject(TrackseeStore);
  private readonly dialogRef = inject(MatDialogRef<TransactionActionsDialogComponent>);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly toast = inject(ToastService);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly editingPayment = signal<Payment | null>(null);
  readonly paymentForm = this.fb.group({ amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]), date: this.fb.control(new Date().toISOString().slice(0, 10), Validators.required), notes: this.fb.control('') });
  readonly paymentDirection = this.transaction.type === 'Lent_To_Them' ? 'Received' : 'Sent';
  readonly paid = this.store.payments().filter((payment) => payment.txId === this.transaction.txId && payment.status === 'Cleared').reduce((total, payment) => total + payment.amount, 0);
  readonly remaining = Math.max(0, this.transaction.amount - this.paid);
  readonly canRecordPayment = ['Lent_To_Them', 'Borrowed_From_Them'].includes(this.transaction.type) && this.transaction.status === 'Pending' && this.remaining > 0;
  readonly paymentHistory = this.store.payments().filter((payment) => payment.txId === this.transaction.txId).sort((a, b) => b.date.localeCompare(a.date));

  formatAmount(amount: number): string { return new Intl.NumberFormat(undefined, { style: 'currency', currency: this.transaction.currency }).format(amount); }
  paymentAmountLimit(): number {
    const editing = this.editingPayment();
    return Math.max(0, this.remaining + (editing?.status === 'Cleared' ? editing.amount : 0));
  }

  editPayment(payment: Payment): void {
    if (this.saving() || payment.status === 'Void') return;
    this.editingPayment.set(payment);
    this.error.set('');
    this.paymentForm.setValue({ amount: payment.amount, date: payment.date, notes: payment.notes });
  }

  cancelPaymentEdit(): void {
    this.editingPayment.set(null);
    this.paymentForm.reset({ amount: null, date: new Date().toISOString().slice(0, 10), notes: '' });
    this.error.set('');
  }

  async removePayment(payment: Payment): Promise<void> {
    if (this.saving() || payment.status === 'Void') return;
    if (!window.confirm(`Remove this ${this.formatAmount(payment.amount)} ${payment.direction.toLowerCase()} payment? It will remain in history but stop affecting the balance.`)) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.store.updatePayment({ ...payment, status: 'Void' });
      this.toast.show('Payment removed from the active balance.', 'success');
      await this.announcer.announce('Payment removed from the active balance.', 'polite');
      this.dialogRef.close(true);
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Could not remove this payment.'); }
    finally { this.saving.set(false); }
  }

  async addPayment(): Promise<void> {
    this.paymentForm.markAllAsTouched();
    if (this.paymentForm.invalid || this.saving()) return;
    const { amount, date, notes } = this.paymentForm.getRawValue();
    const editing = this.editingPayment();
    const alreadyPaid = this.paid - (editing?.status === 'Cleared' ? editing.amount : 0);
    const available = Math.max(0, this.transaction.amount - alreadyPaid);
    if (!amount || amount > available) { this.error.set(`Enter an amount up to ${this.formatAmount(available)}.`); return; }
    const payment: Payment = editing
      ? { ...editing, date, amount, notes: notes.trim() }
      : { paymentId: crypto.randomUUID(), txId: this.transaction.txId, date, direction: this.paymentDirection, amount, currency: this.transaction.currency, notes: notes.trim(), status: 'Cleared', createdAt: new Date().toISOString() };
    this.saving.set(true); this.error.set('');
    try {
      if (editing) {
        const statusUpdated = await this.store.updatePayment(payment);
        this.toast.show(statusUpdated ? 'Payment updated.' : 'Payment updated, but the transaction status could not be changed. Sync the ledger to refresh it.', statusUpdated ? 'success' : 'error');
        await this.announcer.announce(statusUpdated ? 'Payment updated.' : 'Payment updated, but transaction status could not be changed.', statusUpdated ? 'polite' : 'assertive');
      } else {
        const result = await this.store.addPayment(payment);
        if (result === 'cleared') {
          this.toast.show('Payment recorded. The transaction is fully settled and marked cleared.', 'success');
          await this.announcer.announce('Payment recorded. Transaction marked cleared.', 'polite');
        } else if (result === 'status-update-failed') {
          this.toast.show('Payment was recorded, but the status could not be updated. Sync the ledger and check the transaction.', 'error');
          await this.announcer.announce('Payment recorded, but transaction status needs a sync.', 'assertive');
        } else {
          this.toast.show('Payment recorded and linked to this transaction.', 'success');
          await this.announcer.announce('Payment recorded.', 'polite');
        }
      }
      this.dialogRef.close(true);
    } catch (error) { this.error.set(error instanceof Error ? error.message : 'Could not record this payment.'); }
    finally { this.saving.set(false); }
  }
}

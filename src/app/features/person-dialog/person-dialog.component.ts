import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Person } from '../../core/models/tracksee.models';
import { TrackseeStore } from '../../core/store/tracksee.store';
import { environment } from '../../../environments/environment';

export interface PersonDialogData { person?: Person; }

@Component({
  selector: 'ts-person-dialog', standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule],
  templateUrl: './person-dialog.component.html', styleUrl: './person-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PersonDialogComponent {
  readonly data = inject<PersonDialogData>(MAT_DIALOG_DATA);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly dialogRef = inject(MatDialogRef<PersonDialogComponent>);
  private readonly store = inject(TrackseeStore);
  readonly showLocalComments = environment.showLocalComments;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = this.fb.group({
    name: this.fb.control(this.data.person?.name ?? '', [Validators.required, Validators.maxLength(100)]),
    phone: this.fb.control(this.data.person?.phone ?? '', Validators.maxLength(40)),
    email: this.fb.control(this.data.person?.email ?? '', [Validators.maxLength(254), Validators.email]),
    notes: this.fb.control(this.data.person?.notes ?? '', Validators.maxLength(500)),
  });

  async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const values = this.form.getRawValue();
    const person: Person = {
      entityId: this.data.person?.entityId ?? crypto.randomUUID(),
      name: values.name.trim(), phone: values.phone.trim(), email: values.email.trim(),
      notes: this.showLocalComments ? values.notes.trim() : (this.data.person?.notes ?? ''),
      status: this.data.person?.status ?? 'Active',
    };
    if (!person.name) {
      this.error.set('Enter a name for this person.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      if (this.data.person) await this.store.updatePerson(person);
      else await this.store.addPerson(person);
      this.dialogRef.close(person);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not save this person.');
    } finally {
      this.saving.set(false);
    }
  }
}

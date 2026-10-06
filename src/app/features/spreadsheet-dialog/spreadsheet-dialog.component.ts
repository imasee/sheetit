import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { environment } from '../../../environments/environment';
import { SpreadsheetWorkspaceService } from '../../core/services/spreadsheet-workspace.service';
import { TrackseeSpreadsheet } from '../../core/models/tracksee.models';

export interface SpreadsheetDialogData { mode: 'offer' | 'new'; }

@Component({
  selector: 'ts-spreadsheet-dialog', standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatIconModule],
  templateUrl: './spreadsheet-dialog.component.html', styleUrl: './spreadsheet-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpreadsheetDialogComponent {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly dialogRef = inject(MatDialogRef<SpreadsheetDialogComponent, TrackseeSpreadsheet | null>);
  private readonly workspace = inject(SpreadsheetWorkspaceService);
  readonly data = inject<SpreadsheetDialogData>(MAT_DIALOG_DATA);
  readonly environment = environment;
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly form = this.fb.group({ name: this.fb.control(environment.defaultSpreadsheetName, [Validators.required, Validators.maxLength(60)]) });

  async create(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const spreadsheet = await this.workspace.createSpreadsheet(this.form.controls.name.value);
      this.dialogRef.close(spreadsheet);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not create the spreadsheet.');
    } finally {
      this.saving.set(false);
    }
  }
}

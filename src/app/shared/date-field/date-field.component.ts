import { ChangeDetectionStrategy, Component, ElementRef, forwardRef, inject, input } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';

@Component({
  selector: 'ts-date-field',
  standalone: true,
  imports: [MatDatepickerModule, MatInputModule, MatNativeDateModule],
  templateUrl: './date-field.component.html',
  styleUrl: './date-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateFieldComponent), multi: true }],
})
export class DateFieldComponent implements ControlValueAccessor {
  readonly label = input('Choose date');
  readonly inputId = input('ledger-date');
  private readonly host = inject(ElementRef<HTMLElement>);
  value: string | null = null;
  disabled = false;
  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  get dateValue(): Date | null {
    if (!this.value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  writeValue(value: string | null): void { this.value = value || null; }
  registerOnChange(fn: (value: string | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.disabled = disabled; }

  dateChanged(date: Date | null): void {
    if (!date || Number.isNaN(date.getTime())) {
      this.value = null;
    } else {
      this.value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    this.onChange(this.value);
  }

  touched(): void { this.onTouched(); }
}

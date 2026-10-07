import { Directive, ElementRef, HostListener, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Keeps a numeric form value while showing grouped thousands in the text field. */
@Directive({
  selector: 'input[tsThousandsSeparator]',
  standalone: true,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ThousandsSeparatorDirective), multi: true }],
})
export class ThousandsSeparatorDirective implements ControlValueAccessor {
  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private onChange: (value: number | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private disabled = false;

  writeValue(value: number | null): void {
    this.element.nativeElement.value = value === null || value === undefined ? '' : this.format(value, false);
  }

  registerOnChange(fn: (value: number | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.disabled = disabled; this.element.nativeElement.disabled = disabled; }

  @HostListener('input') onInput(): void {
    const input = this.element.nativeElement;
    const caret = input.selectionStart ?? input.value.length;
    const digitsBeforeCaret = (input.value.slice(0, caret).match(/\d/g) ?? []).length;
    const decimalBeforeCaret = input.value.slice(0, caret).includes('.');
    const raw = input.value.replaceAll(',', '').replace(/[^\d.]/g, '');
    const decimalIndex = raw.indexOf('.');
    const normalized = decimalIndex < 0
      ? raw
      : `${raw.slice(0, decimalIndex)}.${raw.slice(decimalIndex + 1).replaceAll('.', '').slice(0, 2)}`;
    const [integer = '', fraction] = normalized.split('.');
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const display = fraction === undefined ? grouped : `${grouped}.${fraction}`;
    input.value = display;

    let nextCaret = 0;
    let digitCount = 0;
    while (nextCaret < display.length && digitCount < digitsBeforeCaret) {
      if (/\d/.test(display[nextCaret])) digitCount++;
      nextCaret++;
    }
    if (decimalBeforeCaret && display[nextCaret] === '.') nextCaret++;
    input.setSelectionRange(nextCaret, nextCaret);
    const numeric = normalized && normalized !== '.' ? Number(normalized) : null;
    this.onChange(numeric !== null && Number.isFinite(numeric) ? numeric : null);
  }

  @HostListener('blur') onBlur(): void {
    const input = this.element.nativeElement;
    const raw = input.value.replaceAll(',', '');
    if (raw && raw !== '.') input.value = this.format(Number(raw), true);
    this.onTouched();
  }

  private format(value: number, fixedDecimals: boolean): string {
    return new Intl.NumberFormat(undefined, {
      useGrouping: true,
      minimumFractionDigits: fixedDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(value);
  }
}

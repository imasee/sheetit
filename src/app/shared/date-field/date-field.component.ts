import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, forwardRef, inject, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Overlay, OverlayModule, ConnectedPosition } from '@angular/cdk/overlay';

@Component({
  selector: 'ts-date-field',
  standalone: true,
  imports: [OverlayModule],
  templateUrl: './date-field.component.html',
  styleUrl: './date-field.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateFieldComponent), multi: true }],
})
export class DateFieldComponent implements ControlValueAccessor {
  readonly label = input('Choose date');
  readonly inputId = input('ledger-date');
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly scrollStrategy = inject(Overlay).scrollStrategies.reposition();
  readonly overlayPositions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
  ];
  value: string | null = null;
  disabled = false;
  readonly calendarOpen = signal(false);
  readonly visibleMonth = signal(this.firstOfMonth(new Date()));
  readonly monthLabel = computed(() => new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(this.visibleMonth()));
  readonly weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  readonly calendarCells = computed(() => {
    const month = this.visibleMonth();
    const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array<null>(firstWeekday).fill(null), ...Array.from({ length: dayCount }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))];
  });
  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  get dateValue(): Date | null {
    if (!this.value) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  writeValue(value: string | null): void {
    this.value = value || null;
    if (this.dateValue) this.visibleMonth.set(this.firstOfMonth(this.dateValue));
  }
  registerOnChange(fn: (value: string | null) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(disabled: boolean): void { this.disabled = disabled; if (disabled) this.calendarOpen.set(false); }

  get displayValue(): string { return this.dateValue ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(this.dateValue) : 'Select a date'; }
  get today(): Date { return new Date(); }
  isoDate(date: Date): string { return this.toIsoDate(date); }
  fullDate(date: Date): string { return new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(date); }

  selectDate(date: Date): void {
    this.value = this.toIsoDate(date);
    this.onChange(this.value);
    this.calendarOpen.set(false);
    this.onTouched();
    setTimeout(() => (this.host.nativeElement.querySelector('.date-trigger') as HTMLButtonElement | null)?.focus());
  }

  toggleCalendar(): void { if (!this.disabled) this.calendarOpen.update((open) => !open); }
  closeCalendar(): void { this.calendarOpen.set(false); }

  changeMonth(offset: number): void {
    const month = this.visibleMonth();
    this.visibleMonth.set(new Date(month.getFullYear(), month.getMonth() + offset, 1));
  }

  isSelected(date: Date): boolean { return this.value === this.toIsoDate(date); }
  isToday(date: Date): boolean { return this.toIsoDate(date) === this.toIsoDate(new Date()); }
  trackCell(index: number, date: Date | null): string { return date ? this.toIsoDate(date) : `empty-${index}`; }

  @HostListener('document:click', ['$event']) closeOnOutsideClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node) && !(event.target as HTMLElement).closest('.cdk-overlay-pane')) this.calendarOpen.set(false);
  }

  @HostListener('keydown.escape') closeOnEscape(): void { this.closeCalendar(); }

  @HostListener('keydown', ['$event']) moveWithArrowKeys(event: KeyboardEvent): void {
    const dayButton = (event.target as HTMLElement).closest<HTMLButtonElement>('.calendar-day');
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const offset = offsets[event.key];
    if (!dayButton || offset === undefined) return;
    event.preventDefault();
    const current = this.fromIsoDate(dayButton.dataset['date'] ?? '');
    if (!current) return;
    const next = new Date(current.getFullYear(), current.getMonth(), current.getDate() + offset);
    this.visibleMonth.set(this.firstOfMonth(next));
    const iso = this.toIsoDate(next);
    setTimeout(() => (this.host.nativeElement.querySelector(`[data-date="${iso}"]`) as HTMLButtonElement | null)?.focus());
  }

  private firstOfMonth(date: Date): Date { return new Date(date.getFullYear(), date.getMonth(), 1); }
  private toIsoDate(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  private fromIsoDate(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  }
}

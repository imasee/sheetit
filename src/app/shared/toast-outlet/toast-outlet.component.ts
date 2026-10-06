import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'ts-toast-outlet', standalone: true, imports: [MatIconModule],
  templateUrl: './toast-outlet.component.html', styleUrl: './toast-outlet.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToastOutletComponent {
  readonly toast = inject(ToastService);
}

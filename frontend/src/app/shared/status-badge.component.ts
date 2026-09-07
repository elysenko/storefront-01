import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { OrderStatus } from '../core/models';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  templateUrl: './status-badge.component.html',
  styleUrl: './status-badge.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatusBadgeComponent {
  readonly status = input.required<OrderStatus>();
}

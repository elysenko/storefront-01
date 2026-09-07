import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { OrdersStore } from '../../core/orders.store';
import { AuthService } from '../../core/auth.service';
import { ORDER_STATUSES, type OrderStatus } from '../../core/models';
import { MoneyPipe } from '../../shared/money.pipe';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [RouterLink, DatePipe, MoneyPipe, StatusBadgeComponent],
  templateUrl: './orders.component.html',
  styleUrl: './orders.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly ordersStore = inject(OrdersStore);
  private readonly auth = inject(AuthService);

  readonly statuses = ORDER_STATUSES;

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly status = computed<OrderStatus | null>(() => {
    const raw = this.params().get('status');
    return raw === 'placed' || raw === 'shipped' || raw === 'delivered' ? raw : null;
  });

  /** Scoped to the signed-in shopper, newest first. */
  readonly orders = computed(() =>
    this.ordersStore.forUser(this.auth.user()?.email ?? null, this.status()),
  );

  readonly totalCount = computed(() =>
    this.ordersStore.forUser(this.auth.user()?.email ?? null, null).length,
  );

  countFor(status: OrderStatus): number {
    return this.ordersStore.forUser(this.auth.user()?.email ?? null, status).length;
  }
}

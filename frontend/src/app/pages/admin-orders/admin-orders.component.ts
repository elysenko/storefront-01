import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { OrdersStore } from '../../core/orders.store';
import { ToastService } from '../../core/toast.service';
import { ORDER_STATUSES, nextStatus, type Order, type OrderStatus } from '../../core/models';
import { MoneyPipe } from '../../shared/money.pipe';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [RouterLink, DatePipe, MoneyPipe, StatusBadgeComponent],
  templateUrl: './admin-orders.component.html',
  styleUrl: './admin-orders.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrdersComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly ordersStore = inject(OrdersStore);
  private readonly toast = inject(ToastService);

  readonly statuses = ORDER_STATUSES;
  readonly error = signal<string | null>(null);
  readonly loading = this.ordersStore.loading;

  constructor() {
    // GET /api/admin/orders returns every order joined to the shopper's email.
    void this.ordersStore.loadAll();
  }

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly status = computed<OrderStatus | null>(() => {
    const raw = this.params().get('status');
    return raw === 'placed' || raw === 'shipped' || raw === 'delivered' ? raw : null;
  });

  /** Every order from every shopper, newest first. */
  readonly orders = computed(() => this.ordersStore.forUser(null, this.status()));
  readonly allOrders = computed(() => this.ordersStore.forUser(null, null));

  readonly revenueCents = computed(() =>
    this.orders().reduce((sum, order) => sum + order.totalCents, 0),
  );

  countFor(status: OrderStatus): number {
    return this.ordersStore.forUser(null, status).length;
  }

  /** Null when the order is already delivered — no further move is legal. */
  nextFor(order: Order): OrderStatus | null {
    return nextStatus(order.status);
  }

  async advance(order: Order, target: OrderStatus): Promise<void> {
    // The API allows placed -> shipped -> delivered only; anything else comes
    // back as a 400 naming the attempted transition.
    const failure = await this.ordersStore.advanceStatus(order.id, target);
    this.error.set(failure);
    if (!failure) {
      this.toast.show(`Order ${order.id} marked ${target}.`);
    }
  }
}

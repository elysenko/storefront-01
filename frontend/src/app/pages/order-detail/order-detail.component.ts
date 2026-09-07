import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { OrdersStore } from '../../core/orders.store';
import { CatalogStore } from '../../core/catalog.store';
import { AuthService } from '../../core/auth.service';
import { ORDER_STATUSES, type OrderItem } from '../../core/models';
import { MoneyPipe } from '../../shared/money.pipe';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, MoneyPipe, StatusBadgeComponent],
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly ordersStore = inject(OrdersStore);
  private readonly catalog = inject(CatalogStore);
  private readonly auth = inject(AuthService);

  readonly statuses = ORDER_STATUSES;

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  readonly order = computed(() => this.ordersStore.byId(this.params().get('id') ?? ''));

  readonly reachedIndex = computed(() => {
    const current = this.order();
    return current ? ORDER_STATUSES.indexOf(current.status) : -1;
  });

  readonly itemsTotalCents = computed(() =>
    (this.order()?.items ?? []).reduce((sum, item) => sum + item.unitPriceCents * item.qty, 0),
  );

  /** A delivered purchase can be reviewed once, and only if not already reviewed. */
  canReview(item: OrderItem): boolean {
    if (this.order()?.status !== 'delivered' || !item.productId) {
      return false;
    }
    return this.catalog.canReview(item.productId, this.auth.user()?.email ?? null);
  }

  /** Soft-deleted products keep their frozen line data but lose their page. */
  stillListed(item: OrderItem): boolean {
    return item.productId !== null && this.catalog.byId(item.productId) !== null;
  }
}

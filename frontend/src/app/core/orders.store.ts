import { Injectable, inject, signal } from '@angular/core';
import type { Order, OrderItem, OrderStatus } from './models';
import { nextStatus } from './models';
import { MOCK_ORDERS } from './mock-data';
import { CartStore } from './cart.store';
import { CatalogStore } from './catalog.store';
import { hydrateAndPersist } from './storage';

@Injectable({ providedIn: 'root' })
export class OrdersStore {
  private readonly cart = inject(CartStore);
  private readonly catalog = inject(CatalogStore);

  /** Backed by GET /api/orders (own) and GET /api/admin/orders (all). */
  readonly orders = signal<Order[]>([...MOCK_ORDERS]);

  private sequence = 1011;

  constructor() {
    if (COLOSSUS_PREVIEW) {
      hydrateAndPersist('orders', this.orders);
    }
  }

  /** Newest first, optionally narrowed to one status. */
  forUser(email: string | null, status: OrderStatus | null): Order[] {
    return this.orders()
      .filter((o) => (email === null || o.userEmail === email) && (status === null || o.status === status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  byId(id: string): Order | null {
    return this.orders().find((o) => o.id === id) ?? null;
  }

  /**
   * Places the order: re-validates stock, freezes productName/unitPriceCents on
   * each line, decrements stock and empties the cart — the API does all of this
   * inside one transaction. Returns the new order, or an error message.
   */
  placeOrder(
    userId: string,
    userEmail: string,
    shipName: string,
    shipAddress: string,
  ): { order: Order } | { error: string } {
    const lines = this.cart.items();
    if (lines.length === 0) {
      return { error: 'Your cart is empty.' };
    }

    const shortfall = this.cart.revalidateStock();
    if (shortfall) {
      return { error: shortfall };
    }

    this.sequence += 1;
    const orderId = `o${this.sequence}`;
    const items: OrderItem[] = lines.map((line, index) => ({
      id: `oi-${orderId}-${index}`,
      orderId,
      productId: line.productId,
      productName: line.productName,
      imageUrl: line.imageUrl,
      unitPriceCents: line.unitPriceCents,
      qty: line.qty,
    }));

    const order: Order = {
      id: orderId,
      userId,
      userEmail,
      status: 'placed',
      totalCents: this.cart.totalCents(),
      shipName,
      shipAddress,
      createdAt: new Date().toISOString(),
      items,
    };

    this.orders.update((list) => [order, ...list]);
    for (const line of lines) {
      this.catalog.decrementStock(line.productId, line.qty);
    }
    this.cart.clear();

    return { order };
  }

  /** Only placed -> shipped -> delivered. Anything else names the attempted move. */
  advanceStatus(orderId: string, target: OrderStatus): string | null {
    const order = this.byId(orderId);
    if (!order) {
      return 'That order no longer exists.';
    }
    if (nextStatus(order.status) !== target) {
      return `Cannot move order ${orderId} from ${order.status} to ${target}.`;
    }
    this.orders.update((list) => list.map((o) => (o.id === orderId ? { ...o, status: target } : o)));
    return null;
  }
}

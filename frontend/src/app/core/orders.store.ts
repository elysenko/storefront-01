import { Injectable, inject, signal } from '@angular/core';
import type { Order, OrderStatus } from './models';
import { ApiService, apiErrorMessage } from './api.service';
import { CartStore } from './cart.store';
import { CatalogStore } from './catalog.store';

/**
 * Orders, backed by GET /api/orders (own), GET /api/admin/orders (all),
 * POST /api/orders (checkout) and PATCH /api/admin/orders/:id/status.
 *
 * Ordering, ownership scoping and the status progression are all decided by the
 * API; this store holds whichever slice the current screen asked for.
 */
@Injectable({ providedIn: 'root' })
export class OrdersStore {
  private readonly api = inject(ApiService);
  private readonly cart = inject(CartStore);
  private readonly catalog = inject(CatalogStore);

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** GET /api/orders — the signed-in shopper's own orders, newest first. */
  async loadMine(): Promise<void> {
    await this.fetch(() => this.api.listOrders(), 'Your orders could not be loaded right now.');
  }

  /** GET /api/admin/orders — every order joined to the shopper's email. */
  async loadAll(): Promise<void> {
    await this.fetch(() => this.api.adminListOrders(), 'Orders could not be loaded right now.');
  }

  /** GET /api/orders/:id — own, or any when the caller is an admin. */
  async loadOne(id: string): Promise<void> {
    if (!id) {
      return;
    }
    this.loading.set(true);
    try {
      this.merge(await this.api.getOrder(id));
      this.error.set(null);
    } catch (error) {
      this.orders.update((list) => list.filter((o) => o.id !== id));
      this.error.set(apiErrorMessage(error, 'That order could not be loaded.'));
    } finally {
      this.loading.set(false);
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
   * POST /api/orders. Stock re-validation, order creation, the stock decrement
   * and emptying the cart all happen inside one server-side transaction, so a
   * line that ran short comes back as a 400 naming the product.
   */
  async placeOrder(shipName: string, shipAddress: string): Promise<{ order: Order } | { error: string }> {
    try {
      const order = await this.api.checkout(shipName, shipAddress);
      this.merge(order);
      this.cart.clear();
      // Stock changed server-side; re-read rather than adjusting locally.
      void this.catalog.load();
      return { order };
    } catch (error) {
      void this.cart.load();
      return { error: apiErrorMessage(error, 'Your order could not be placed.') };
    }
  }

  /** PATCH /api/admin/orders/:id/status — placed -> shipped -> delivered only. */
  async advanceStatus(orderId: string, target: OrderStatus): Promise<string | null> {
    try {
      const result = await this.api.adminAdvanceOrder(orderId, target);
      this.orders.update((list) =>
        list.map((o) => (o.id === orderId ? { ...o, status: result.status } : o)),
      );
      return null;
    } catch (error) {
      return apiErrorMessage(error, 'That status change was rejected.');
    }
  }

  private async fetch(call: () => Promise<Order[]>, fallback: string): Promise<void> {
    this.loading.set(true);
    try {
      this.orders.set(await call());
      this.error.set(null);
    } catch (error) {
      this.error.set(apiErrorMessage(error, fallback));
    } finally {
      this.loading.set(false);
    }
  }

  private merge(order: Order): void {
    this.orders.update((list) => [order, ...list.filter((o) => o.id !== order.id)]);
  }
}

import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { CartItem, Product } from './models';
import { ApiService, apiErrorMessage, type CartView } from './api.service';
import { sessionUser } from './session';

/**
 * The server-side cart, keyed on userId (GET/POST/PATCH/DELETE /api/cart).
 *
 * Persistence across a sign-out/sign-in cycle is inherent: nothing is held in
 * the browser, so signing back in simply re-reads the same rows. Every mutation
 * replaces the local lines with the cart view the API returns, which is what
 * keeps stock caps and line totals authoritative.
 */
@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly api = inject(ApiService);

  readonly items = signal<CartItem[]>([]);
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  constructor() {
    // Reload on sign-in, drop the lines on sign-out, so the header badge always
    // reflects the account that is actually signed in.
    effect(() => {
      const user = sessionUser();
      untracked(() => {
        if (user) {
          void this.load();
        } else {
          this.items.set([]);
          this.error.set(null);
        }
      });
    });
  }

  readonly count = computed(() => this.items().reduce((sum, line) => sum + line.qty, 0));
  readonly totalCents = computed(() => this.items().reduce((sum, line) => sum + line.lineTotalCents, 0));
  readonly isEmpty = computed(() => this.items().length === 0);

  async load(): Promise<void> {
    if (!sessionUser()) {
      return;
    }
    this.loading.set(true);
    try {
      this.apply(await this.api.getCart());
      this.error.set(null);
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Your cart could not be loaded right now.'));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Upserts by (cartId, productId), summing quantity. The API rejects a
   * resulting qty above stock with a message naming the product and leaves the
   * existing qty unchanged. Returns that message, or null on success.
   */
  async addItem(product: Product, qty: number): Promise<string | null> {
    if (qty < 1) {
      return 'Choose a quantity of at least 1.';
    }
    if (!sessionUser()) {
      return 'Sign in to add items to your cart.';
    }
    return this.mutate(() => this.api.addCartItem(product.id, qty));
  }

  /** Rejects qty < 1 or qty > stock with a message naming the product. */
  async updateQty(lineId: string, qty: number): Promise<string | null> {
    return this.mutate(() => this.api.updateCartItem(lineId, qty));
  }

  async removeItem(lineId: string): Promise<string | null> {
    return this.mutate(() => this.api.removeCartItem(lineId));
  }

  /** Local reset after a checkout — the server already emptied the cart. */
  clear(): void {
    this.items.set([]);
    this.error.set(null);
  }

  private async mutate(call: () => Promise<CartView>): Promise<string | null> {
    try {
      this.apply(await call());
      this.error.set(null);
      return null;
    } catch (error) {
      const message = apiErrorMessage(error, 'That change could not be saved.');
      this.error.set(message);
      return message;
    }
  }

  private apply(view: CartView): void {
    this.items.set(view.items);
  }
}

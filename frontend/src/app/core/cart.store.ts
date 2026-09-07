import { Injectable, computed, inject, signal } from '@angular/core';
import type { CartItem, Product } from './models';
import { CatalogStore } from './catalog.store';
import { MOCK_PRODUCTS } from './mock-data';
import { hydrateAndPersist } from './storage';

const price = (id: string): number => MOCK_PRODUCTS.find((p) => p.id === id)?.priceCents ?? 0;
const image = (id: string): string => MOCK_PRODUCTS.find((p) => p.id === id)?.imageUrl ?? '';

@Injectable({ providedIn: 'root' })
export class CartStore {
  private readonly catalog = inject(CatalogStore);

  /** Backed by GET /api/cart — the server-side cart keyed on userId. */
  readonly items = signal<CartItem[]>([
    {
      id: 'ci1',
      cartId: 'cart-u2',
      productId: 'p1',
      productName: 'Wireless Headphones',
      imageUrl: image('p1'),
      unitPriceCents: price('p1'),
      stockQty: 12,
      qty: 1,
      lineTotalCents: price('p1'),
    },
    {
      id: 'ci2',
      cartId: 'cart-u2',
      productId: 'p8',
      productName: 'Atlas of Small Cities',
      imageUrl: image('p8'),
      unitPriceCents: price('p8'),
      stockQty: 9,
      qty: 2,
      lineTotalCents: price('p8') * 2,
    },
  ]);

  readonly error = signal<string | null>(null);

  constructor() {
    if (COLOSSUS_PREVIEW) {
      // Mirrors the real server-side cart keyed on userId: contents survive a
      // refresh and a sign-out/sign-in cycle.
      hydrateAndPersist('cart', this.items);
    }
  }

  readonly count = computed(() => this.items().reduce((sum, line) => sum + line.qty, 0));
  readonly totalCents = computed(() => this.items().reduce((sum, line) => sum + line.lineTotalCents, 0));
  readonly isEmpty = computed(() => this.items().length === 0);

  private reprice(lines: CartItem[]): CartItem[] {
    return lines.map((line) => ({ ...line, lineTotalCents: line.unitPriceCents * line.qty }));
  }

  /**
   * Upserts by (cartId, productId), summing quantity. A resulting qty above
   * stock is rejected with a message naming the product; the existing qty is
   * left unchanged. Returns an error message, or null on success.
   */
  addItem(product: Product, qty: number): string | null {
    if (qty < 1) {
      return 'Choose a quantity of at least 1.';
    }
    if (product.stockQty === 0) {
      return `${product.name} is out of stock.`;
    }

    const existing = this.items().find((line) => line.productId === product.id);
    const nextQty = (existing?.qty ?? 0) + qty;

    if (nextQty > product.stockQty) {
      return `Only ${product.stockQty} of ${product.name} left in stock.`;
    }

    if (existing) {
      this.items.update((lines) =>
        this.reprice(lines.map((line) => (line.productId === product.id ? { ...line, qty: nextQty } : line))),
      );
    } else {
      const line: CartItem = {
        id: `ci${this.items().length + 1}${product.id}`,
        cartId: 'cart-u2',
        productId: product.id,
        productName: product.name,
        imageUrl: product.imageUrl,
        unitPriceCents: product.priceCents,
        stockQty: product.stockQty,
        qty,
        lineTotalCents: product.priceCents * qty,
      };
      this.items.update((lines) => [...lines, line]);
    }
    this.error.set(null);
    return null;
  }

  /** Rejects qty < 1 or qty > stock with a message naming the product. */
  updateQty(lineId: string, qty: number): string | null {
    const line = this.items().find((l) => l.id === lineId);
    if (!line) {
      return null;
    }
    if (qty < 1) {
      const message = `Quantity for ${line.productName} must be at least 1.`;
      this.error.set(message);
      return message;
    }
    if (qty > line.stockQty) {
      const message = `Only ${line.stockQty} of ${line.productName} left in stock.`;
      this.error.set(message);
      return message;
    }
    this.items.update((lines) => this.reprice(lines.map((l) => (l.id === lineId ? { ...l, qty } : l))));
    this.error.set(null);
    return null;
  }

  removeItem(lineId: string): void {
    this.items.update((lines) => lines.filter((l) => l.id !== lineId));
    this.error.set(null);
  }

  clear(): void {
    this.items.set([]);
    this.error.set(null);
  }

  /**
   * Checkout-time stock re-validation. Returns a message naming the first
   * product that ran short, or null when every line still fits.
   */
  revalidateStock(): string | null {
    for (const line of this.items()) {
      const product = this.catalog.byId(line.productId);
      const available = product?.stockQty ?? 0;
      if (line.qty > available) {
        return `${line.productName} only has ${available} left in stock — reduce the quantity to continue.`;
      }
    }
    return null;
  }
}

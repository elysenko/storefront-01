import { Injectable, computed, signal } from '@angular/core';
import type { Category, Paginated, Product, Review } from './models';
import { MOCK_CATEGORIES, MOCK_PRODUCTS, MOCK_REVIEWS, REVIEWABLE_PRODUCT_IDS } from './mock-data';
import { hydrateAndPersist } from './storage';

export const PAGE_SIZE = 12;

@Injectable({ providedIn: 'root' })
export class CatalogStore {
  /** Backed by GET /api/products — soft-deleted rows are filtered client-side here. */
  readonly products = signal<Product[]>([...MOCK_PRODUCTS]);
  /** Backed by GET /api/categories. */
  readonly categories = signal<Category[]>([...MOCK_CATEGORIES]);
  /** Backed by GET /api/products/:id/reviews. */
  readonly reviews = signal<Review[]>([...MOCK_REVIEWS]);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    if (COLOSSUS_PREVIEW) {
      // Admin product edits and new reviews persist across a refresh.
      hydrateAndPersist('products', this.products);
      hydrateAndPersist('reviews', this.reviews);
    }
  }

  /** Live catalog: soft-deleted products never surface in browse or search. */
  readonly liveProducts = computed(() => this.products().filter((p) => p.deletedAt === null));

  categoryName(categoryId: string | null): string | null {
    if (!categoryId) {
      return null;
    }
    return this.categories().find((c) => c.id === categoryId)?.name ?? null;
  }

  /** Mirrors GET /api/products?q=&categoryId=&page= — 12 per page, filters compose. */
  search(q: string, categoryId: string | null, page: number): Paginated<Product> {
    const needle = q.trim().toLowerCase();
    const matches = this.liveProducts().filter((p) => {
      const matchesQuery = needle === '' || p.name.toLowerCase().includes(needle);
      const matchesCategory = !categoryId || p.categoryId === categoryId;
      return matchesQuery && matchesCategory;
    });

    const total = matches.length;
    const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), lastPage);
    const start = (safePage - 1) * PAGE_SIZE;

    return { items: matches.slice(start, start + PAGE_SIZE), total, page: safePage, pageSize: PAGE_SIZE };
  }

  /** Mirrors GET /api/products/:id — soft-deleted reads as missing. */
  byId(id: string): Product | null {
    return this.liveProducts().find((p) => p.id === id) ?? null;
  }

  /** Includes soft-deleted rows; the admin list needs them, catalog does not. */
  byIdIncludingDeleted(id: string): Product | null {
    return this.products().find((p) => p.id === id) ?? null;
  }

  reviewsFor(productId: string): Review[] {
    return this.reviews()
      .filter((r) => r.productId === productId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Review eligibility: bought on a delivered order, and not already reviewed. */
  canReview(productId: string, userEmail: string | null): boolean {
    if (!userEmail || !REVIEWABLE_PRODUCT_IDS.includes(productId)) {
      return false;
    }
    return !this.reviews().some((r) => r.productId === productId && r.userEmail === userEmail);
  }

  /**
   * Inserts the review and recomputes the denormalized avgRating/reviewCount in
   * the same step, exactly as the API does inside one transaction.
   * Returns an error message, or null on success.
   */
  addReview(productId: string, userEmail: string, rating: number, body: string): string | null {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return 'Choose a rating between 1 and 5 stars.';
    }
    if (!body.trim()) {
      return 'Write a few words about the product.';
    }
    if (this.reviews().some((r) => r.productId === productId && r.userEmail === userEmail)) {
      return 'You have already reviewed this product.';
    }

    const review: Review = {
      id: `r${this.reviews().length + 1}${productId}`,
      productId,
      userId: 'u2',
      userEmail,
      rating,
      body: body.trim(),
      createdAt: new Date().toISOString(),
    };
    this.reviews.update((list) => [review, ...list]);

    const all = this.reviews().filter((r) => r.productId === productId);
    const avg = all.reduce((sum, r) => sum + r.rating, 0) / all.length;
    this.products.update((list) =>
      list.map((p) =>
        p.id === productId ? { ...p, avgRating: Math.round(avg * 10) / 10, reviewCount: all.length } : p,
      ),
    );
    return null;
  }

  createProduct(input: Omit<Product, 'id' | 'avgRating' | 'reviewCount' | 'deletedAt' | 'categoryName'>): Product {
    const product: Product = {
      ...input,
      id: `p${this.products().length + 1}`,
      categoryName: this.categoryName(input.categoryId) ?? 'Uncategorised',
      avgRating: 0,
      reviewCount: 0,
      deletedAt: null,
    };
    this.products.update((list) => [product, ...list]);
    return product;
  }

  updateProduct(id: string, patch: Partial<Product>): void {
    this.products.update((list) =>
      list.map((p) =>
        p.id === id
          ? { ...p, ...patch, categoryName: this.categoryName(patch.categoryId ?? p.categoryId) ?? p.categoryName }
          : p,
      ),
    );
  }

  /** Soft delete: hidden from catalog, search and admin list; orders untouched. */
  softDelete(id: string): void {
    this.products.update((list) =>
      list.map((p) => (p.id === id ? { ...p, deletedAt: new Date().toISOString() } : p)),
    );
  }

  /** Applies a checkout's stock decrement. */
  decrementStock(productId: string, qty: number): void {
    this.products.update((list) =>
      list.map((p) => (p.id === productId ? { ...p, stockQty: Math.max(0, p.stockQty - qty) } : p)),
    );
  }
}

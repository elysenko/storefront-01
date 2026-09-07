import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import type { Category, Paginated, Product, Review } from './models';
import { ApiService, apiErrorMessage, type ProductInput } from './api.service';

export const PAGE_SIZE = 12;

/** The four categories the storefront is organised around. */
const BASELINE_CATEGORIES = ['Electronics', 'Home', 'Books', 'Sports'];

/** Backend caps a page at 100 rows; 20 pages is a hard stop against a runaway loop. */
const FETCH_PAGE_SIZE = 100;
const MAX_PAGES = 20;

/**
 * Live catalog, backed by GET /api/categories and GET /api/products.
 *
 * The whole live catalog is pulled into memory once and browse/search/paging
 * are then resolved locally against it. That keeps the catalog, the product
 * page's "more in this category" rail and the admin table reading from one
 * consistent snapshot, and every mutation re-reads from the server rather than
 * patching the snapshot optimistically.
 */
@Injectable({ providedIn: 'root' })
export class CatalogStore {
  private readonly api = inject(ApiService);

  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly reviews = signal<Review[]>([]);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** Server-decided review eligibility per product id (GET …/reviews/eligibility). */
  private readonly eligibility = signal<Record<string, boolean>>({});
  private inflight: Promise<void> | null = null;

  constructor() {
    void this.load();
  }

  /** Coalesces concurrent callers onto one in-flight refresh. */
  load(): Promise<void> {
    if (!this.inflight) {
      this.inflight = this.fetchAll().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async fetchAll(): Promise<void> {
    this.loading.set(true);
    try {
      const [categories, products] = await Promise.all([
        this.api.listCategories(),
        this.fetchAllProducts(),
      ]);
      this.categories.set(categories);
      this.products.set(products);
      this.error.set(null);
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'The catalog could not be loaded right now.'));
    } finally {
      this.loading.set(false);
    }
  }

  private async fetchAllProducts(): Promise<Product[]> {
    const items: Product[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result: Paginated<Product> = await this.api.listProducts({ page, pageSize: FETCH_PAGE_SIZE });
      items.push(...result.items);
      if (result.items.length === 0 || items.length >= result.total) {
        break;
      }
    }
    return items;
  }

  /**
   * Product page load: the detail endpoint carries the reviews, so one request
   * refreshes both the row and its review list. Review eligibility is asked for
   * separately because it depends on the caller's delivered orders.
   */
  async loadProduct(id: string): Promise<void> {
    if (!id) {
      return;
    }
    try {
      const detail = await this.api.getProduct(id);
      const { reviews, ...product } = detail;
      this.mergeProduct(product as Product);
      this.mergeReviews(id, reviews);
      this.error.set(null);
    } catch (error) {
      // 404 == missing or soft-deleted: drop the row so the page renders its
      // "not found" state. Anything else is a transport problem worth surfacing.
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.products.update((list) => list.filter((p) => p.id !== id));
      } else {
        this.error.set(apiErrorMessage(error, 'That product could not be loaded right now.'));
      }
    }
    await this.loadEligibility(id);
  }

  /** Populates `canReview()` for one product; anonymous callers read as "no". */
  async loadEligibility(productId: string): Promise<void> {
    if (!productId) {
      return;
    }
    try {
      const result = await this.api.reviewEligibility(productId);
      this.eligibility.update((current) => ({ ...current, [productId]: result.eligible }));
    } catch {
      this.eligibility.update((current) => ({ ...current, [productId]: false }));
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

  /**
   * Review eligibility is the server's answer (a delivered order containing the
   * product, not already reviewed) — never re-derived in the browser.
   */
  canReview(productId: string, userEmail: string | null): boolean {
    if (!userEmail || !productId) {
      return false;
    }
    return this.eligibility()[productId] === true;
  }

  /**
   * POST /api/products/:id/reviews. The API inserts and recomputes the
   * denormalized avgRating/reviewCount in one transaction, so the product row is
   * re-read afterwards rather than adjusted locally.
   * Returns an error message, or null on success.
   */
  async addReview(productId: string, _userEmail: string, rating: number, body: string): Promise<string | null> {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return 'Choose a rating between 1 and 5 stars.';
    }
    if (!body.trim()) {
      return 'Write a few words about the product.';
    }
    try {
      await this.api.createReview(productId, rating, body.trim());
      await this.loadProduct(productId);
      return null;
    } catch (error) {
      return apiErrorMessage(error, 'Your review could not be saved.');
    }
  }

  /** POST /api/admin/products. Returns an error message, or null on success. */
  async createProduct(input: ProductInput): Promise<string | null> {
    try {
      const product = await this.api.adminCreateProduct(input);
      this.mergeProduct(product);
      return null;
    } catch (error) {
      return apiErrorMessage(error, 'The product could not be created.');
    }
  }

  /** PATCH /api/admin/products/:id. */
  async updateProduct(id: string, patch: Partial<ProductInput>): Promise<string | null> {
    try {
      const product = await this.api.adminUpdateProduct(id, patch);
      this.mergeProduct(product);
      return null;
    } catch (error) {
      return apiErrorMessage(error, 'The product could not be saved.');
    }
  }

  /** DELETE /api/admin/products/:id — soft delete; orders and reviews are untouched. */
  async softDelete(id: string): Promise<string | null> {
    try {
      const result = await this.api.adminDeleteProduct(id);
      this.products.update((list) =>
        list.map((p) => (p.id === id ? { ...p, deletedAt: result.deletedAt } : p)),
      );
      return null;
    } catch (error) {
      return apiErrorMessage(error, 'The product could not be removed.');
    }
  }

  /**
   * Categories are reference data and ship with no fixtures, so the product form
   * would otherwise present an empty, unusable dropdown on a fresh deployment.
   * `POST /api/admin/categories` is idempotent on name, so this is safe to call
   * whenever an admin opens the form.
   */
  async ensureCategories(): Promise<void> {
    if (this.categories().length > 0) {
      return;
    }
    try {
      const created = await Promise.all(
        BASELINE_CATEGORIES.map((name) => this.api.adminCreateCategory(name)),
      );
      this.categories.set([...created].sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      /* a non-admin (or an offline API) simply keeps the empty list */
    }
  }

  private mergeProduct(product: Product): void {
    this.products.update((list) => {
      const index = list.findIndex((p) => p.id === product.id);
      if (index === -1) {
        return [product, ...list];
      }
      const next = [...list];
      next[index] = product;
      return next;
    });
  }

  private mergeReviews(productId: string, reviews: Review[]): void {
    this.reviews.update((list) => [...list.filter((r) => r.productId !== productId), ...reviews]);
  }
}

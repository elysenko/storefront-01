import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  Category,
  Order,
  OrderStatus,
  Paginated,
  Product,
  Review,
  SystemSetting,
  User,
} from './models';

/**
 * The single HTTP surface for the NestJS API.
 *
 * Same-origin `/api` in every deployment: nginx proxies `/api/` to the backend
 * container in production and `proxy.conf.json` does the same for `ng serve`,
 * so no base URL ever has to be configured in the browser bundle.
 */
export const API_BASE = '/api';

/** Backend caps `pageSize` at 100 (QueryProductsDto). */
const MAX_PAGE_SIZE = 100;

export interface AuthSession {
  token: string;
  user: User;
}

export interface CartView {
  id: string;
  items: import('./models').CartItem[];
  totalCents: number;
  count: number;
}

export interface ReviewEligibility {
  eligible: boolean;
  reason: 'ok' | 'signed-out' | 'not-purchased' | 'already-reviewed';
}

export interface ProductInput {
  name: string;
  categoryId: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  stockQty: number;
}

/**
 * Turns an HttpErrorResponse into the message the API actually sent.
 *
 * Nest's exception filter emits `{ message: string | string[] }`, and the
 * service layer deliberately names the product in stock and status errors, so
 * surfacing that text verbatim is what makes those flows legible in the UI.
 */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Cannot reach the server right now. Check your connection and try again.';
    }
    const body: unknown = error.error;
    if (typeof body === 'string' && body.trim() !== '') {
      return body;
    }
    if (typeof body === 'object' && body !== null) {
      const message = (body as { message?: unknown }).message;
      if (Array.isArray(message) && message.length > 0) {
        return String(message[0]);
      }
      if (typeof message === 'string' && message.trim() !== '') {
        return message;
      }
    }
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  // ---------------------------------------------------------------- auth ---

  login(email: string, password: string): Promise<AuthSession> {
    return this.post<AuthSession>('/auth/login', { email, password });
  }

  signup(email: string, password: string): Promise<AuthSession> {
    return this.post<AuthSession>('/auth/signup', { email, password });
  }

  me(): Promise<User> {
    return this.get<User>('/auth/me');
  }

  // ------------------------------------------------------------- catalog ---

  listCategories(): Promise<Category[]> {
    return this.get<Category[]>('/categories');
  }

  listProducts(query: { q?: string; categoryId?: string; page?: number; pageSize?: number } = {}): Promise<
    Paginated<Product>
  > {
    let params = new HttpParams();
    if (query.q) {
      params = params.set('q', query.q);
    }
    if (query.categoryId) {
      params = params.set('categoryId', query.categoryId);
    }
    params = params.set('page', String(query.page ?? 1));
    params = params.set('pageSize', String(Math.min(query.pageSize ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE)));
    return this.get<Paginated<Product>>('/products', params);
  }

  getProduct(id: string): Promise<Product & { reviews: Review[] }> {
    return this.get<Product & { reviews: Review[] }>(`/products/${encodeURIComponent(id)}`);
  }

  // ------------------------------------------------------------- reviews ---

  listReviews(productId: string): Promise<Review[]> {
    return this.get<Review[]>(`/products/${encodeURIComponent(productId)}/reviews`);
  }

  reviewEligibility(productId: string): Promise<ReviewEligibility> {
    return this.get<ReviewEligibility>(`/products/${encodeURIComponent(productId)}/reviews/eligibility`);
  }

  createReview(productId: string, rating: number, body: string): Promise<Review> {
    return this.post<Review>(`/products/${encodeURIComponent(productId)}/reviews`, { rating, body });
  }

  // ---------------------------------------------------------------- cart ---

  getCart(): Promise<CartView> {
    return this.get<CartView>('/cart');
  }

  addCartItem(productId: string, qty: number): Promise<CartView> {
    return this.post<CartView>('/cart/items', { productId, qty });
  }

  updateCartItem(itemId: string, qty: number): Promise<CartView> {
    return this.patch<CartView>(`/cart/items/${encodeURIComponent(itemId)}`, { qty });
  }

  removeCartItem(itemId: string): Promise<CartView> {
    return this.delete<CartView>(`/cart/items/${encodeURIComponent(itemId)}`);
  }

  // -------------------------------------------------------------- orders ---

  listOrders(status?: OrderStatus | null): Promise<Order[]> {
    return this.get<Order[]>('/orders', status ? new HttpParams().set('status', status) : undefined);
  }

  getOrder(id: string): Promise<Order> {
    return this.get<Order>(`/orders/${encodeURIComponent(id)}`);
  }

  checkout(shipName: string, shipAddress: string): Promise<Order> {
    return this.post<Order>('/orders', { shipName, shipAddress });
  }

  // --------------------------------------------------------------- admin ---

  adminListProducts(q?: string | null): Promise<Product[]> {
    return this.get<Product[]>('/admin/products', q ? new HttpParams().set('q', q) : undefined);
  }

  adminCreateProduct(input: ProductInput): Promise<Product> {
    return this.post<Product>('/admin/products', input);
  }

  adminUpdateProduct(id: string, input: Partial<ProductInput>): Promise<Product> {
    return this.patch<Product>(`/admin/products/${encodeURIComponent(id)}`, input);
  }

  adminDeleteProduct(id: string): Promise<{ id: string; deletedAt: string }> {
    return this.delete<{ id: string; deletedAt: string }>(`/admin/products/${encodeURIComponent(id)}`);
  }

  adminCreateCategory(name: string): Promise<Category> {
    return this.post<Category>('/admin/categories', { name });
  }

  adminListOrders(status?: OrderStatus | null): Promise<Order[]> {
    return this.get<Order[]>('/admin/orders', status ? new HttpParams().set('status', status) : undefined);
  }

  adminAdvanceOrder(id: string, status: OrderStatus): Promise<{ id: string; status: OrderStatus }> {
    return this.patch<{ id: string; status: OrderStatus }>(
      `/admin/orders/${encodeURIComponent(id)}/status`,
      { status },
    );
  }

  adminListSettings(): Promise<SystemSetting[]> {
    return this.get<SystemSetting[]>('/admin/settings');
  }

  adminSaveSettings(values: Record<string, string>): Promise<SystemSetting[]> {
    return this.patch<SystemSetting[]>('/admin/settings', values);
  }

  // ------------------------------------------------------------ verbs ---

  private get<T>(path: string, params?: HttpParams): Promise<T> {
    return firstValueFrom(this.http.get<T>(`${API_BASE}${path}`, params ? { params } : {}));
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(`${API_BASE}${path}`, body));
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(`${API_BASE}${path}`, body));
  }

  private delete<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(`${API_BASE}${path}`));
  }
}

/** Domain contract mirrored from the API surface. Money is always integer cents. */

export type Role = 'shopper' | 'admin';
export type OrderStatus = 'placed' | 'shipped' | 'delivered';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface Category {
  id: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  imageUrl: string;
  stockQty: number;
  categoryId: string;
  categoryName: string;
  avgRating: number;
  reviewCount: number;
  deletedAt: string | null;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  userEmail: string;
  rating: number;
  body: string;
  createdAt: string;
}

export interface CartItem {
  id: string;
  cartId: string;
  productId: string;
  productName: string;
  imageUrl: string;
  unitPriceCents: number;
  stockQty: number;
  qty: number;
  lineTotalCents: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string | null;
  productName: string;
  imageUrl: string;
  unitPriceCents: number;
  qty: number;
}

export interface Order {
  id: string;
  userId: string;
  userEmail: string;
  status: OrderStatus;
  totalCents: number;
  shipName: string;
  shipAddress: string;
  createdAt: string;
  items: OrderItem[];
}

export interface SystemSetting {
  key: string;
  label: string;
  value: string;
  configured: boolean;
  service: string;
  secret: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const ORDER_STATUSES: OrderStatus[] = ['placed', 'shipped', 'delivered'];

/** Next legal status in the placed -> shipped -> delivered progression. */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  const i = ORDER_STATUSES.indexOf(status);
  return i >= 0 && i < ORDER_STATUSES.length - 1 ? ORDER_STATUSES[i + 1] : null;
}

/** Format integer cents for display. Never used for arithmetic. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

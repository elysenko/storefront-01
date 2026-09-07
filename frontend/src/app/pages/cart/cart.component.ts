import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CartStore } from '../../core/cart.store';
import { ToastService } from '../../core/toast.service';
import { MoneyPipe } from '../../shared/money.pipe';
import type { CartItem } from '../../core/models';

const FREE_SHIPPING_THRESHOLD_CENTS = 5000;

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [RouterLink, MoneyPipe],
  templateUrl: './cart.component.html',
  styleUrl: './cart.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartComponent {
  private readonly toast = inject(ToastService);
  readonly cart = inject(CartStore);

  readonly items = this.cart.items;
  readonly totalCents = this.cart.totalCents;
  readonly error = this.cart.error;

  readonly shippingCents = computed(() =>
    this.totalCents() >= FREE_SHIPPING_THRESHOLD_CENTS || this.totalCents() === 0 ? 0 : 599,
  );
  readonly grandTotalCents = computed(() => this.totalCents() + this.shippingCents());
  readonly remainingForFreeShipping = computed(() =>
    Math.max(0, FREE_SHIPPING_THRESHOLD_CENTS - this.totalCents()),
  );

  async step(line: CartItem, delta: number): Promise<void> {
    // PATCH /api/cart/items/:id — a qty over stock comes back as a 400 naming
    // the product, which the store surfaces in `error()`.
    await this.cart.updateQty(line.id, line.qty + delta);
  }

  async remove(line: CartItem): Promise<void> {
    const error = await this.cart.removeItem(line.id);
    if (!error) {
      this.toast.show(`${line.productName} removed from your cart.`);
    }
  }
}

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

  step(line: CartItem, delta: number): void {
    this.cart.updateQty(line.id, line.qty + delta);
  }

  remove(line: CartItem): void {
    this.cart.removeItem(line.id);
    this.toast.show(`${line.productName} removed from your cart.`);
  }
}

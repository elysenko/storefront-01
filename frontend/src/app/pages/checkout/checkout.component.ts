import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CartStore } from '../../core/cart.store';
import { OrdersStore } from '../../core/orders.store';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { MoneyPipe } from '../../shared/money.pipe';

type Step = 'shipping' | 'review';

/** Two-step checkout. The step lives in ?step= so a refresh lands back on it. */
@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [FormsModule, RouterLink, MoneyPipe],
  templateUrl: './checkout.component.html',
  styleUrl: './checkout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orders = inject(OrdersStore);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  readonly cart = inject(CartStore);

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly step = computed<Step>(() => (this.params().get('step') === 'review' ? 'review' : 'shipping'));

  readonly shipName = signal('');
  readonly shipAddress = signal('');
  readonly error = signal<string | null>(null);
  readonly placing = signal(false);

  readonly totalCents = this.cart.totalCents;
  readonly shippingCents = computed(() => (this.totalCents() >= 5000 ? 0 : 599));
  readonly grandTotalCents = computed(() => this.totalCents() + this.shippingCents());

  goToStep(step: Step): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step },
      queryParamsHandling: 'merge',
    });
  }

  continueToReview(): void {
    if (!this.shipName().trim()) {
      this.error.set('Enter the name the parcel should be addressed to.');
      return;
    }
    if (this.shipAddress().trim().length < 10) {
      this.error.set('Enter a full delivery address, including the city and postcode.');
      return;
    }
    this.error.set(null);
    this.goToStep('review');
  }

  placeOrder(): void {
    const user = this.auth.user();
    if (!user) {
      this.error.set('Sign in to place this order.');
      return;
    }

    this.placing.set(true);
    const result = this.orders.placeOrder(
      user.id,
      user.email,
      this.shipName().trim(),
      this.shipAddress().trim(),
    );
    this.placing.set(false);

    if ('error' in result) {
      // Stock ran short between adding to the cart and checking out — the
      // message names the product rather than failing silently.
      this.error.set(result.error);
      return;
    }

    this.toast.show(`Order ${result.order.id} placed.`);
    void this.router.navigate(['/orders', result.order.id]);
  }
}

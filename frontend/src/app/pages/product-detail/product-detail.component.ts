import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { CatalogStore } from '../../core/catalog.store';
import { CartStore } from '../../core/cart.store';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { StarRatingComponent } from '../../shared/star-rating.component';
import { ModalComponent } from '../../shared/modal.component';
import { ReviewFormComponent, type ReviewDraft } from '../../shared/review-form.component';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    UpperCasePipe,
    MoneyPipe,
    StarRatingComponent,
    ModalComponent,
    ReviewFormComponent,
  ],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogStore);
  private readonly cart = inject(CartStore);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  private readonly pathParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly productId = computed(() => this.pathParams().get('id') ?? '');
  readonly product = computed(() => this.catalog.byId(this.productId()));
  readonly reviews = computed(() => this.catalog.reviewsFor(this.productId()));
  readonly loading = this.catalog.loading;

  constructor() {
    // GET /api/products/:id carries the reviews, and the eligibility call that
    // follows it decides whether the review form is offered at all.
    effect(() => {
      const id = this.productId();
      untracked(() => void this.catalog.loadProduct(id));
    });
  }

  /** Tab and modal state are query params, so both are deep-linkable. */
  readonly tab = computed(() => (this.queryParams().get('tab') === 'reviews' ? 'reviews' : 'description'));
  readonly reviewModalOpen = computed(() => this.queryParams().get('modal') === 'review');

  readonly user = this.auth.user;
  readonly qty = signal(1);
  readonly addError = signal<string | null>(null);
  readonly reviewError = signal<string | null>(null);

  readonly inStock = computed(() => (this.product()?.stockQty ?? 0) > 0);
  readonly maxQty = computed(() => Math.max(1, this.product()?.stockQty ?? 1));

  readonly canReview = computed(() =>
    this.catalog.canReview(this.productId(), this.user()?.email ?? null),
  );

  readonly related = computed(() => {
    const current = this.product();
    if (!current) {
      return [];
    }
    return this.catalog
      .liveProducts()
      .filter((p) => p.categoryId === current.categoryId && p.id !== current.id)
      .slice(0, 4);
  });

  stepQty(delta: number): void {
    this.qty.update((q) => Math.min(this.maxQty(), Math.max(1, q + delta)));
    this.addError.set(null);
  }

  async addToCart(): Promise<void> {
    const product = this.product();
    if (!product) {
      return;
    }
    if (!this.user()) {
      void this.router.navigate(['/login'], {
        queryParams: { redirect: this.router.url },
      });
      return;
    }
    const error = await this.cart.addItem(product, this.qty());
    this.addError.set(error);
    if (!error) {
      this.toast.show(`${product.name} × ${this.qty()} added to your cart.`);
    }
  }

  openReview(): void {
    this.reviewError.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { modal: 'review', tab: 'reviews' },
      queryParamsHandling: 'merge',
    });
  }

  closeReview(): void {
    this.reviewError.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { modal: null },
      queryParamsHandling: 'merge',
    });
  }

  async submitReview(draft: ReviewDraft): Promise<void> {
    const email = this.user()?.email;
    if (!email) {
      this.reviewError.set('Sign in to leave a review.');
      return;
    }
    // 409 (already reviewed), 403 (not a delivered purchase) and 400 (rating out
    // of range) all come back as the API's own wording, shown inline.
    const error = await this.catalog.addReview(this.productId(), email, draft.rating, draft.body);
    if (error) {
      this.reviewError.set(error);
      return;
    }
    this.toast.show('Thanks — your review is published.');
    this.closeReview();
  }
}

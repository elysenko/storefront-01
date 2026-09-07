import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CatalogStore, PAGE_SIZE } from '../../core/catalog.store';
import { CartStore } from '../../core/cart.store';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import type { Product } from '../../core/models';
import { ProductCardComponent } from '../../shared/product-card.component';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [RouterLink, ProductCardComponent],
  templateUrl: './catalog.component.html',
  styleUrl: './catalog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogStore);
  private readonly cart = inject(CartStore);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly loading = this.catalog.loading;
  readonly error = this.catalog.error;
  readonly pageSize = PAGE_SIZE;

  /** All browse state lives in the URL, so any view survives a refresh. */
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly query = computed(() => this.params().get('q') ?? '');
  readonly categoryId = computed(() => this.params().get('category'));
  readonly page = computed(() => Number(this.params().get('page') ?? '1') || 1);

  readonly categoryName = computed(() => this.catalog.categoryName(this.categoryId()));
  readonly result = computed(() => this.catalog.search(this.query(), this.categoryId(), this.page()));

  readonly heading = computed(() => this.categoryName() ?? 'All products');
  readonly lastPage = computed(() => Math.max(1, Math.ceil(this.result().total / this.pageSize)));
  readonly pages = computed(() => Array.from({ length: this.lastPage() }, (_, i) => i + 1));

  readonly rangeStart = computed(() =>
    this.result().total === 0 ? 0 : (this.result().page - 1) * this.pageSize + 1,
  );
  readonly rangeEnd = computed(() =>
    Math.min(this.result().page * this.pageSize, this.result().total),
  );

  readonly hasFilters = computed(() => this.query() !== '' || this.categoryId() !== null);
  readonly catalogSize = computed(() => this.catalog.liveProducts().length);

  goToPage(page: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page === 1 ? null : page },
      queryParamsHandling: 'merge',
    });
  }

  async addToCart(product: Product): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      void this.router.navigate(['/login'], { queryParams: { redirect: '/cart' } });
      return;
    }
    // The API is the authority on stock: a 400 comes back naming the product.
    const error = await this.cart.addItem(product, 1);
    if (error) {
      this.toast.show(error, 'error');
      return;
    }
    this.toast.show(`${product.name} added to your cart.`);
  }
}

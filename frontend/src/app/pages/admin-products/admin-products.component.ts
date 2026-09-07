import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CatalogStore } from '../../core/catalog.store';
import { ToastService } from '../../core/toast.service';
import { MoneyPipe } from '../../shared/money.pipe';
import { StarRatingComponent } from '../../shared/star-rating.component';
import { ModalComponent } from '../../shared/modal.component';

@Component({
  selector: 'app-admin-products',
  standalone: true,
  imports: [FormsModule, RouterLink, MoneyPipe, StarRatingComponent, ModalComponent],
  templateUrl: './admin-products.component.html',
  styleUrl: './admin-products.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProductsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogStore);
  private readonly toast = inject(ToastService);

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly query = computed(() => this.params().get('q') ?? '');
  readonly draftQuery = signal('');

  /** ?modal=delete&id=<product> — the confirm dialog is deep-linkable. */
  readonly deleteId = computed(() =>
    this.params().get('modal') === 'delete' ? this.params().get('id') : null,
  );
  readonly deleteTarget = computed(() => {
    const id = this.deleteId();
    return id ? this.catalog.byId(id) : null;
  });

  /** Soft-deleted products drop out of the admin list too. */
  readonly products = computed(() => {
    const needle = this.query().trim().toLowerCase();
    return this.catalog
      .liveProducts()
      .filter((p) => needle === '' || p.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly outOfStockCount = computed(() => this.products().filter((p) => p.stockQty === 0).length);
  readonly inventoryValueCents = computed(() =>
    this.products().reduce((sum, p) => sum + p.priceCents * p.stockQty, 0),
  );

  constructor() {
    effect(() => this.draftQuery.set(this.query()));
  }

  search(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: this.draftQuery().trim() || null },
      queryParamsHandling: 'merge',
    });
  }

  askDelete(id: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { modal: 'delete', id },
      queryParamsHandling: 'merge',
    });
  }

  closeDelete(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { modal: null, id: null },
      queryParamsHandling: 'merge',
    });
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target) {
      return;
    }
    this.catalog.softDelete(target.id);
    this.toast.show(`${target.name} removed from the catalog. Past orders are untouched.`);
    this.closeDelete();
  }
}

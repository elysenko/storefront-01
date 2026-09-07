import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogStore } from '../../core/catalog.store';
import { ToastService } from '../../core/toast.service';
import { productImage } from '../../core/product-image';

/** Create and edit share this screen; the :id route param selects edit mode. */
@Component({
  selector: 'app-admin-product-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './admin-product-form.component.html',
  styleUrl: './admin-product-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProductFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogStore);
  private readonly toast = inject(ToastService);

  readonly categories = this.catalog.categories;
  readonly loading = this.catalog.loading;
  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly productId = this.route.snapshot.paramMap.get('id');
  readonly editing = this.productId !== null;

  /**
   * Reactive rather than read once at construction: the catalog is fetched from
   * the API, so on a cold load of /admin/products/:id/edit the row arrives after
   * the component does.
   */
  readonly existing = computed(() =>
    this.productId ? this.catalog.byIdIncludingDeleted(this.productId) : null,
  );

  /** Price is entered in dollars for legibility and stored as integer cents. */
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    categoryId: ['', [Validators.required]],
    description: ['', [Validators.required, Validators.minLength(20)]],
    price: ['', [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)]],
    stockQty: [0, [Validators.required, Validators.min(0)]],
    imageUrl: [''],
  });

  readonly heading = computed(() => (this.editing ? 'Edit product' : 'New product'));

  private patched = false;

  constructor() {
    // Categories are reference data with no fixtures, so a fresh deployment
    // would otherwise offer an empty, unusable dropdown. The endpoint is
    // idempotent on name.
    void this.catalog.ensureCategories();

    effect(() => {
      const product = this.existing();
      untracked(() => {
        if (!product || this.patched) {
          return;
        }
        this.patched = true;
        this.form.patchValue({
          name: product.name,
          categoryId: product.categoryId,
          description: product.description,
          price: (product.priceCents / 100).toFixed(2),
          stockQty: product.stockQty,
          imageUrl: product.imageUrl,
        });
      });
    });
  }

  invalid(control: string): boolean {
    const field = this.form.get(control);
    return !!field && field.invalid && (field.touched || this.submitted());
  }

  async save(): Promise<void> {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const priceCents = Math.round(Number(value.price) * 100);
    const category = this.categories().find((c) => c.id === value.categoryId);
    const imageUrl =
      value.imageUrl.trim() || productImage(category?.name.toLowerCase() ?? 'default', value.name);

    const input = {
      name: value.name.trim(),
      categoryId: value.categoryId,
      description: value.description.trim(),
      priceCents,
      stockQty: Number(value.stockQty),
      imageUrl,
    };

    this.saving.set(true);
    const error =
      this.editing && this.productId
        ? await this.catalog.updateProduct(this.productId, input)
        : await this.catalog.createProduct(input);
    this.saving.set(false);

    if (error) {
      this.saveError.set(error);
      return;
    }

    this.saveError.set(null);
    this.toast.show(
      this.editing ? `${input.name} updated.` : `${input.name} added to the catalog.`,
    );
    void this.router.navigate(['/admin/products']);
  }
}

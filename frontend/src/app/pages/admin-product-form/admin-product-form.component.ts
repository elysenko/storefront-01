import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
  readonly submitted = signal(false);

  readonly productId = this.route.snapshot.paramMap.get('id');
  readonly editing = this.productId !== null;
  readonly existing = this.productId ? this.catalog.byIdIncludingDeleted(this.productId) : null;

  /** Price is entered in dollars for legibility and stored as integer cents. */
  readonly form = this.fb.nonNullable.group({
    name: [this.existing?.name ?? '', [Validators.required, Validators.minLength(3)]],
    categoryId: [this.existing?.categoryId ?? '', [Validators.required]],
    description: [this.existing?.description ?? '', [Validators.required, Validators.minLength(20)]],
    price: [
      this.existing ? (this.existing.priceCents / 100).toFixed(2) : '',
      [Validators.required, Validators.pattern(/^\d+(\.\d{1,2})?$/)],
    ],
    stockQty: [this.existing?.stockQty ?? 0, [Validators.required, Validators.min(0)]],
    imageUrl: [this.existing?.imageUrl ?? ''],
  });

  readonly heading = computed(() => (this.editing ? 'Edit product' : 'New product'));

  invalid(control: string): boolean {
    const field = this.form.get(control);
    return !!field && field.invalid && (field.touched || this.submitted());
  }

  save(): void {
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

    if (this.editing && this.productId) {
      this.catalog.updateProduct(this.productId, {
        name: value.name.trim(),
        categoryId: value.categoryId,
        description: value.description.trim(),
        priceCents,
        stockQty: Number(value.stockQty),
        imageUrl,
      });
      this.toast.show(`${value.name.trim()} updated.`);
    } else {
      this.catalog.createProduct({
        name: value.name.trim(),
        categoryId: value.categoryId,
        description: value.description.trim(),
        priceCents,
        stockQty: Number(value.stockQty),
        imageUrl,
      });
      this.toast.show(`${value.name.trim()} added to the catalog.`);
    }

    void this.router.navigate(['/admin/products']);
  }
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Product } from '../core/models';
import { MoneyPipe } from './money.pipe';
import { StarRatingComponent } from './star-rating.component';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [RouterLink, MoneyPipe, StarRatingComponent],
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCardComponent {
  readonly product = input.required<Product>();
  readonly added = output<Product>();
}

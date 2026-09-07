import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Renders a Float average rating as five stars with fractional fill. */
@Component({
  selector: 'app-star-rating',
  standalone: true,
  templateUrl: './star-rating.component.html',
  styleUrl: './star-rating.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StarRatingComponent {
  readonly rating = input<number>(0);
  readonly count = input<number | null>(null);
  readonly compact = input<boolean>(false);

  readonly percent = computed(() => Math.max(0, Math.min(5, this.rating())) * 20);
  readonly label = computed(() => {
    const n = this.count();
    if (this.rating() === 0 && (n === null || n === 0)) {
      return 'No reviews yet';
    }
    return `Rated ${this.rating().toFixed(1)} out of 5 from ${n ?? 0} reviews`;
  });
}

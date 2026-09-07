import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface ReviewDraft {
  rating: number;
  body: string;
}

/** 1-5 stars plus text. Server-side 400 / 409 responses render inline above it. */
@Component({
  selector: 'app-review-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './review-form.component.html',
  styleUrl: './review-form.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewFormComponent {
  readonly productName = input.required<string>();
  readonly error = input<string | null>(null);
  readonly submitted = output<ReviewDraft>();
  readonly cancelled = output<void>();

  readonly stars = [1, 2, 3, 4, 5];
  readonly rating = signal(0);
  readonly body = signal('');

  setRating(value: number): void {
    this.rating.set(value);
  }

  submit(): void {
    this.submitted.emit({ rating: this.rating(), body: this.body() });
  }
}

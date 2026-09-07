import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

/** Signup always creates a shopper — the role is never client-settable. */
@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupComponent {
  private readonly auth = inject(AuthService);

  /** Ships empty — no prefilled or seeded credentials anywhere. */
  readonly name = signal('');
  readonly email = signal('');
  readonly password = signal('');
  readonly confirm = signal('');
  readonly error = signal<string | null>(null);

  readonly submitting = signal(false);

  /** POST /api/auth/signup; a duplicate email comes back as a 409, shown inline. */
  async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    if (!this.name().trim()) {
      this.error.set('Tell us your name so we can address your orders.');
      return;
    }
    this.submitting.set(true);
    this.error.set(await this.auth.signup(this.email(), this.password(), this.confirm()));
    this.submitting.set(false);
  }
}

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

  readonly previewShortcut = COLOSSUS_PREVIEW ? 'Skip signup — Demo Mode' : null;

  submit(): void {
    if (!this.name().trim()) {
      this.error.set('Tell us your name so we can address your orders.');
      return;
    }
    this.error.set(this.auth.signup(this.email(), this.password(), this.confirm()));
  }

  skipSignup(): void {
    this.auth.previewSignIn('shopper');
  }
}

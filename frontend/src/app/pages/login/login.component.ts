import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth.service';

/**
 * One sign-in screen for both roles — there is deliberately no /admin/login.
 * Honours ?redirect=<url> after a successful sign-in.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  readonly redirect = computed(() => this.params().get('redirect'));

  /** Ships empty — no prefilled or seeded credentials anywhere. */
  readonly email = signal('');
  readonly password = signal('');
  readonly error = signal<string | null>(null);

  readonly submitting = signal(false);

  /** POST /api/auth/login; a 401 renders inline rather than navigating away. */
  async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.error.set(await this.auth.login(this.email(), this.password(), this.redirect()));
    this.submitting.set(false);
  }
}

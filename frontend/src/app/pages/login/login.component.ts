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

  /**
   * Preview-only shortcut. Held in TypeScript behind the build-time constant so
   * esbuild drops it from the production bundle; it seeds the signed-in state
   * directly and needs no credentials.
   */
  readonly previewShortcut = COLOSSUS_PREVIEW ? 'Skip login — Demo Mode' : null;

  submit(): void {
    this.error.set(this.auth.login(this.email(), this.password(), this.redirect()));
  }

  skipLogin(): void {
    this.auth.previewSignIn('shopper');
  }
}

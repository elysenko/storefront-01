import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { CartStore } from '../core/cart.store';

/**
 * Mobile primary navigation. Replaces the desktop category bar below 768px —
 * four items or fewer, so a tab bar beats a drawer here.
 */
@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './bottom-nav.component.html',
  styleUrl: './bottom-nav.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BottomNavComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly cart = inject(CartStore);

  readonly isAdmin = this.auth.isAdmin;

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  readonly hidden = computed(() => {
    const path = this.url().split('?')[0];
    return path === '/login' || path === '/signup';
  });
}

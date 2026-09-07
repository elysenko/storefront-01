import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { CartStore } from '../core/cart.store';
import { CatalogStore } from '../core/catalog.store';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeaderComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(CatalogStore);
  readonly cart = inject(CartStore);

  readonly categories = this.catalog.categories;
  readonly user = this.auth.user;
  readonly isAdmin = this.auth.isAdmin;
  readonly cartCount = this.cart.count;

  readonly query = signal('');
  readonly drawerOpen = signal(false);
  readonly accountOpen = signal(false);

  /** Preview-only role switcher, so a reviewer can see both role's navigation. */
  readonly previewSwitch = COLOSSUS_PREVIEW
    ? { shopper: 'Preview as shopper', admin: 'Preview as admin' }
    : null;

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Active category id, read straight from the URL so it survives a refresh. */
  readonly activeCategory = computed(() => {
    const raw = this.url().split('?')[1] ?? '';
    return new URLSearchParams(raw).get('category');
  });

  readonly onAuthScreen = computed(() => {
    const path = this.url().split('?')[0];
    return path === '/login' || path === '/signup';
  });

  search(): void {
    this.drawerOpen.set(false);
    void this.router.navigate(['/'], {
      queryParams: { q: this.query().trim() || null, page: null },
      queryParamsHandling: 'merge',
      relativeTo: this.route,
    });
  }

  toggleDrawer(): void {
    this.drawerOpen.update((v) => !v);
    this.accountOpen.set(false);
  }

  toggleAccount(): void {
    this.accountOpen.update((v) => !v);
  }

  closeMenus(): void {
    this.drawerOpen.set(false);
    this.accountOpen.set(false);
  }

  logout(): void {
    this.closeMenus();
    this.auth.logout();
  }

  previewAs(role: 'shopper' | 'admin'): void {
    this.closeMenus();
    this.auth.previewSignIn(role);
  }
}

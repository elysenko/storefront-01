import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth.guard';

/**
 * Every navigable state is URL-addressable and deep-linkable, and carries a
 * `data.flow` node id. Tabs, wizard steps and modals are driven by query params
 * (?tab=, ?step=, ?modal=) rather than component memory, so a reviewer or an
 * automated pass can reach any state by URL alone.
 *
 * `''` renders the catalog directly — never a redirect — so the root URL always
 * paints the brand plus the product grid.
 */
export const routes: Routes = [
  {
    path: '',
    title: 'Storefront',
    data: { flow: 'catalog.browse' },
    loadComponent: () => import('./pages/catalog/catalog.component').then((m) => m.CatalogComponent),
  },
  {
    path: 'products/:id',
    title: 'Product · Storefront',
    data: { flow: 'catalog.product' },
    loadComponent: () =>
      import('./pages/product-detail/product-detail.component').then((m) => m.ProductDetailComponent),
  },
  {
    path: 'login',
    title: 'Sign in · Storefront',
    data: { flow: 'auth.login' },
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    title: 'Create account · Storefront',
    data: { flow: 'auth.signup' },
    loadComponent: () => import('./pages/signup/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'cart',
    title: 'Cart · Storefront',
    data: { flow: 'cart.view' },
    canActivate: [authGuard],
    loadComponent: () => import('./pages/cart/cart.component').then((m) => m.CartComponent),
  },
  {
    path: 'checkout',
    title: 'Checkout · Storefront',
    data: { flow: 'checkout.flow' },
    canActivate: [authGuard],
    loadComponent: () => import('./pages/checkout/checkout.component').then((m) => m.CheckoutComponent),
  },
  {
    path: 'orders',
    title: 'Your orders · Storefront',
    data: { flow: 'orders.history' },
    canActivate: [authGuard],
    loadComponent: () => import('./pages/orders/orders.component').then((m) => m.OrdersComponent),
  },
  {
    path: 'orders/:id',
    title: 'Order · Storefront',
    data: { flow: 'orders.detail' },
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/order-detail/order-detail.component').then((m) => m.OrderDetailComponent),
  },
  {
    path: 'admin/products',
    title: 'Manage products · Storefront',
    data: { flow: 'admin.products' },
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./pages/admin-products/admin-products.component').then((m) => m.AdminProductsComponent),
  },
  {
    path: 'admin/products/new',
    title: 'New product · Storefront',
    data: { flow: 'admin.productCreate' },
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./pages/admin-product-form/admin-product-form.component').then(
        (m) => m.AdminProductFormComponent,
      ),
  },
  {
    path: 'admin/products/:id/edit',
    title: 'Edit product · Storefront',
    data: { flow: 'admin.productEdit' },
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./pages/admin-product-form/admin-product-form.component').then(
        (m) => m.AdminProductFormComponent,
      ),
  },
  {
    path: 'admin/orders',
    title: 'All orders · Storefront',
    data: { flow: 'admin.orders' },
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./pages/admin-orders/admin-orders.component').then((m) => m.AdminOrdersComponent),
  },
  {
    path: 'admin/settings',
    title: 'Service settings · Storefront',
    data: { flow: 'admin.settings' },
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./pages/admin-settings/admin-settings.component').then((m) => m.AdminSettingsComponent),
  },
  { path: '**', redirectTo: '' },
];

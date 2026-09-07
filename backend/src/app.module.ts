import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { ReviewsModule } from './reviews/reviews.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { AdminModule } from './admin/admin.module';

/**
 * Storefront API. Every controller lives under the global `/api` prefix set in
 * main.ts; the Angular SPA is served separately by nginx, which proxies `/api/`
 * to this process.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    ReviewsModule,
    CartModule,
    OrdersModule,
    AdminModule,
  ],
})
export class AppModule {}

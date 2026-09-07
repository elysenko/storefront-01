import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { SettingsService } from './settings.service';
import { AdminProductsController } from './admin-products.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminCategoriesController } from './admin-categories.controller';
import { OrdersModule } from '../orders/orders.module';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [OrdersModule, CatalogModule],
  controllers: [
    AdminProductsController,
    AdminOrdersController,
    AdminCategoriesController,
    AdminSettingsController,
  ],
  providers: [AdminService, SettingsService],
  exports: [SettingsService],
})
export class AdminModule {}

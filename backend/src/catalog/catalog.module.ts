import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { ProductsController } from './products.controller';
import { CategoriesController } from './categories.controller';

@Module({
  controllers: [ProductsController, CategoriesController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}

import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CatalogService, type Paginated, type ProductView, type ReviewView } from './catalog.service';
import { QueryProductsDto } from './dto/query-products.dto';

@ApiTags('catalog')
@Controller('products')
export class ProductsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@Query() query: QueryProductsDto): Promise<Paginated<ProductView>> {
    return this.catalog.listProducts(query);
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<ProductView & { reviews: ReviewView[] }> {
    return this.catalog.getProduct(id);
  }
}

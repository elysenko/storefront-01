import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryAdminProductsDto } from './dto/query-admin-products.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { ProductView } from '../catalog/catalog.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/products')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminProductsController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  list(@Query() query: QueryAdminProductsDto): Promise<ProductView[]> {
    return this.admin.listProducts(query.q);
  }

  @Post()
  create(@Body() dto: CreateProductDto): Promise<ProductView> {
    return this.admin.createProduct(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto): Promise<ProductView> {
    return this.admin.updateProduct(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string): Promise<{ id: string; deletedAt: string }> {
    return this.admin.deleteProduct(id);
  }
}

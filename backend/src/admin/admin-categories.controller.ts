import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CatalogService } from '../catalog/catalog.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

/**
 * Categories are reference data and ship with no fixtures, so the admin console
 * needs a way to create the first one before any product can exist.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminCategoriesController {
  constructor(
    private readonly admin: AdminService,
    private readonly catalog: CatalogService,
  ) {}

  @Get()
  list(): Promise<{ id: string; name: string }[]> {
    return this.catalog.listCategories();
  }

  /** Idempotent on name — re-posting an existing category returns that row. */
  @Post()
  create(@Body() dto: CreateCategoryDto): Promise<{ id: string; name: string }> {
    return this.admin.createCategory(dto);
  }
}

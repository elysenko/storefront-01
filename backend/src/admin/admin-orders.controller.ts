import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { AdminService } from './admin.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService, type OrderView } from '../orders/orders.service';
import { QueryOrdersDto } from '../orders/dto/query-orders.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminOrdersController {
  constructor(
    private readonly admin: AdminService,
    private readonly orders: OrdersService,
  ) {}

  @Get()
  list(@Query() query: QueryOrdersDto): Promise<OrderView[]> {
    return this.orders.listAll(query.status);
  }

  @Patch(':id/status')
  async advance(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<{ id: string; status: OrderStatus }> {
    const status = await this.admin.advanceOrderStatus(id, dto.status);
    return { id, status };
  }
}

import { IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class QueryOrdersDto {
  @IsOptional()
  @IsEnum(OrderStatus, { message: 'Unknown order status.' })
  status?: OrderStatus;
}

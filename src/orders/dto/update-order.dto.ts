import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

export const ORDER_STATUS_UPDATE_VALUES = [
  'DRAFT',
  'PENDING',
  'CONFIRMED',
  'CANCELED',
] as const;
export type OrderStatusUpdateValue =
  (typeof ORDER_STATUS_UPDATE_VALUES)[number];

export class UpdateOrderDto extends PartialType(CreateOrderDto) {
  @IsOptional()
  @IsIn(ORDER_STATUS_UPDATE_VALUES)
  override status?: OrderStatusUpdateValue;
}

import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { CreatePurchaseOrderDto } from './create-purchase-order.dto';

export const PURCHASE_ORDER_UPDATE_STATUS_VALUES = ['CANCELED'] as const;
export type PurchaseOrderUpdateStatusValue =
  (typeof PURCHASE_ORDER_UPDATE_STATUS_VALUES)[number];

export class UpdatePurchaseOrderDto extends PartialType(
  CreatePurchaseOrderDto,
) {
  @IsOptional()
  @IsUUID('4')
  override storeId?: string;

  @IsOptional()
  @IsIn(PURCHASE_ORDER_UPDATE_STATUS_VALUES)
  status?: PurchaseOrderUpdateStatusValue;
}

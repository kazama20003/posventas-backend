import { IsUUID } from 'class-validator';

export class ReceivePurchaseOrderDto {
  @IsUUID('4')
  warehouseId: string;
}

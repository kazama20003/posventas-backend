import { IsOptional, IsUUID } from 'class-validator';

export class FulfillOrderDto {
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;
}

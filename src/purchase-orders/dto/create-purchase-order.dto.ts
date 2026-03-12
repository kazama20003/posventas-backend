import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const PURCHASE_ORDER_UNIT_OF_MEASURE_VALUES = [
  'UNIT',
  'KG',
  'G',
  'L',
  'ML',
  'M',
  'CM',
  'BOX',
  'PACK',
  'DOZEN',
] as const;

export type PurchaseOrderUnitOfMeasureValue =
  (typeof PURCHASE_ORDER_UNIT_OF_MEASURE_VALUES)[number];

export class CreatePurchaseOrderLineDto {
  @IsUUID('4')
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost: number;

  @IsOptional()
  @IsIn(PURCHASE_ORDER_UNIT_OF_MEASURE_VALUES)
  unitOfMeasure?: PurchaseOrderUnitOfMeasureValue;
}

export class CreatePurchaseOrderDto {
  @IsUUID('4')
  supplierId: string;

  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineDto)
  lines: CreatePurchaseOrderLineDto[];
}

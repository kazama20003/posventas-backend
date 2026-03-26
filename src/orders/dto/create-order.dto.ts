import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const ORDER_STATUS_CREATE_VALUES = [
  'DRAFT',
  'PENDING',
  'CONFIRMED',
  'CANCELED',
] as const;
export type OrderStatusCreateValue =
  (typeof ORDER_STATUS_CREATE_VALUES)[number];

export const ORDER_PAYMENT_PROVIDER_VALUES = [
  'CASH',
  'CARD',
  'STRIPE',
  'PAYPAL',
  'OTHER',
] as const;
export type OrderPaymentProviderValue =
  (typeof ORDER_PAYMENT_PROVIDER_VALUES)[number];

export const ORDER_PAYMENT_STATUS_VALUES = [
  'PENDING',
  'COMPLETED',
  'FAILED',
  'REFUNDED',
] as const;
export type OrderPaymentStatusValue =
  (typeof ORDER_PAYMENT_STATUS_VALUES)[number];

export const ORDER_UNIT_OF_MEASURE_VALUES = [
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
export type OrderUnitOfMeasureValue =
  (typeof ORDER_UNIT_OF_MEASURE_VALUES)[number];

export class CreateOrderLineDto {
  @IsUUID('4')
  variantId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsIn(ORDER_UNIT_OF_MEASURE_VALUES)
  unitOfMeasure?: OrderUnitOfMeasureValue;
}

export class CreateOrderPaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  @IsIn(ORDER_PAYMENT_PROVIDER_VALUES)
  provider: OrderPaymentProviderValue;

  @IsOptional()
  @IsIn(ORDER_PAYMENT_STATUS_VALUES)
  status?: OrderPaymentStatusValue;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(160)
  providerRef?: string | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  paidAt?: Date;
}

export class CreateOrderDto {
  @IsUUID('4')
  storeId: string;

  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsIn(ORDER_STATUS_CREATE_VALUES)
  status?: OrderStatusCreateValue;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderLineDto)
  lines: CreateOrderLineDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderPaymentDto)
  payments?: CreateOrderPaymentDto[];
}

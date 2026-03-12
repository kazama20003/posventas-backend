import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const PRODUCT_TYPE_VALUES = ['PHYSICAL', 'SERVICE'] as const;
export type ProductTypeValue = (typeof PRODUCT_TYPE_VALUES)[number];
export const UNIT_OF_MEASURE_VALUES = [
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
export type UnitOfMeasureValue = (typeof UNIT_OF_MEASURE_VALUES)[number];

export class ProductImageDto {
  @IsString()
  @MaxLength(500)
  key: string;

  @IsString()
  @MaxLength(1000)
  url: string;
}

export class ProductVariantDto {
  @IsOptional()
  @IsUUID('4')
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sku: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(120)
  barcode?: string | null;

  @IsOptional()
  @IsIn(UNIT_OF_MEASURE_VALUES)
  unitOfMeasure?: UnitOfMeasureValue;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsObject()
  attributes?: Record<string, string | number | boolean | null> | null;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cost?: number | null;
}

export class CreateProductDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsUUID('4')
  categoryId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  images?: ProductImageDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(120)
  brand?: string | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  trackStock?: boolean;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxRate: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsIn(PRODUCT_TYPE_VALUES)
  productType?: ProductTypeValue;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  visibleInPos?: boolean;
}

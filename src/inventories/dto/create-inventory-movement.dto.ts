import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateInventoryMovementDto {
  @IsUUID('4')
  variantId: string;

  @IsUUID('4')
  warehouseId: string;

  @Type(() => Number)
  @IsInt()
  delta: number;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceId?: string;
}

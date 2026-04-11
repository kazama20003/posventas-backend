import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const CASH_MOVEMENT_MANUAL_TYPES = ['CASH_IN', 'CASH_OUT'] as const;
export type CashMovementManualType =
  (typeof CASH_MOVEMENT_MANUAL_TYPES)[number];

export class CreateCashMovementDto {
  @IsUUID('4')
  cashRegisterId: string;

  @IsOptional()
  @IsUUID('4')
  cashSessionId?: string;

  @IsIn(CASH_MOVEMENT_MANUAL_TYPES)
  type: CashMovementManualType;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceId?: string;
}

import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class OpenCashSessionDto {
  @IsUUID('4')
  cashRegisterId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingAmount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

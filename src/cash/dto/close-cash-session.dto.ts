import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CloseCashSessionDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedClosingAmount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

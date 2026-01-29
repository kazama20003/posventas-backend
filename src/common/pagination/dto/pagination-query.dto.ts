import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsPositive, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  @Max(100)
  limit: number = 10;

  // 🔥 listo para enterprise APIs
  @IsOptional()
  sortBy?: string;

  @IsOptional()
  order?: 'asc' | 'desc';
}

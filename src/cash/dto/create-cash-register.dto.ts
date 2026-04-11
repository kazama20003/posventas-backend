import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCashRegisterDto {
  @IsUUID('4')
  storeId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;
}

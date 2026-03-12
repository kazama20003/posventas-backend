import {
  ArrayUnique,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
  IsBoolean,
  IsArray,
  IsIn,
  IsUUID,
} from 'class-validator';

export const USER_ROLE_VALUES = [
  'OWNER',
  'ADMIN',
  'SELLER',
  'CASHIER',
] as const;
export type UserRoleValue = (typeof USER_ROLE_VALUES)[number];

export class CreateUserDto {
  @IsEmail()
  email: string;

  // tu password en DB es String, en backend lo guardas hasheado
  @IsString()
  @MinLength(6)
  @MaxLength(72)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: 'ruc debe tener 11 dígitos' })
  ruc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsIn(USER_ROLE_VALUES)
  role?: UserRoleValue;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  storeIds?: string[];
}

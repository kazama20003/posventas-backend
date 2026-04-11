import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export const SUBSCRIPTION_PLAN_VALUES = [
  'FREE',
  'PRO',
  'ENTERPRISE',
] as const;
export type SubscriptionPlanValue =
  (typeof SUBSCRIPTION_PLAN_VALUES)[number];

export const SUBSCRIPTION_STATUS_VALUES = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
] as const;
export type SubscriptionStatusValue =
  (typeof SUBSCRIPTION_STATUS_VALUES)[number];

export const SUBSCRIPTION_PROVIDER_VALUES = ['STRIPE', 'OTHER'] as const;
export type SubscriptionProviderValue =
  (typeof SUBSCRIPTION_PROVIDER_VALUES)[number];

export const SUBSCRIPTION_PAYMENT_METHOD_VALUES = [
  'YAPE',
  'STRIPE',
  'CARD',
  'CASH',
  'BANK_TRANSFER',
  'PAYPAL',
  'OTHER',
] as const;
export type SubscriptionPaymentMethodValue =
  (typeof SUBSCRIPTION_PAYMENT_METHOD_VALUES)[number];

export class CreateSubscriptionDto {
  @IsOptional()
  @IsIn(SUBSCRIPTION_PLAN_VALUES)
  plan?: SubscriptionPlanValue;

  @IsOptional()
  @IsIn(SUBSCRIPTION_STATUS_VALUES)
  status?: SubscriptionStatusValue;

  @IsOptional()
  @IsIn(SUBSCRIPTION_PROVIDER_VALUES)
  provider?: SubscriptionProviderValue;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  providerCustomerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  providerSubscriptionId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10)
  @IsIn(SUBSCRIPTION_PAYMENT_METHOD_VALUES, { each: true })
  paymentMethods?: SubscriptionPaymentMethodValue[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  currentPeriodStart?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  currentPeriodEnd?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  trialEndsAt?: Date | null;

  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  canceledAt?: Date | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  lastProviderEventAt?: Date | null;
}

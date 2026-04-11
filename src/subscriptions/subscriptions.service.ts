import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SubscriptionPaymentMethod,
  SubscriptionPlan,
  SubscriptionProvider,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSubscriptionDto,
  SubscriptionPaymentMethodValue,
} from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

const subscriptionSelect = {
  id: true,
  tenantId: true,
  plan: true,
  status: true,
  provider: true,
  providerCustomerId: true,
  providerSubscriptionId: true,
  paymentMethods: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  trialEndsAt: true,
  cancelAtPeriodEnd: true,
  canceledAt: true,
  lastProviderEventAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SubscriptionSelect;

type SubscriptionResponse = Prisma.SubscriptionGetPayload<{
  select: typeof subscriptionSelect;
}>;

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeOptionalString(
    value: string | null | undefined,
  ): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeOptionalDate(
    value: Date | null | undefined,
  ): Date | null | undefined {
    if (value === undefined || value === null) {
      return value;
    }

    if (Number.isNaN(value.getTime())) {
      throw new BadRequestException('Se envio una fecha de suscripcion invalida.');
    }

    return value;
  }

  private normalizePaymentMethods(
    paymentMethods: SubscriptionPaymentMethodValue[] | undefined,
  ): SubscriptionPaymentMethod[] | undefined {
    if (paymentMethods === undefined) {
      return undefined;
    }

    return [...new Set(paymentMethods)].map(
      (paymentMethod) => paymentMethod as SubscriptionPaymentMethod,
    );
  }

  private validateDateRange(
    start: Date | null | undefined,
    end: Date | null | undefined,
  ): void {
    if (start && end && start.getTime() > end.getTime()) {
      throw new BadRequestException(
        'La fecha inicial del periodo no puede ser mayor que la fecha final.',
      );
    }
  }

  private validateCanceledState(
    status: SubscriptionStatus,
    canceledAt: Date | null | undefined,
  ): void {
    if (status !== SubscriptionStatus.CANCELED && canceledAt) {
      throw new BadRequestException(
        'Solo puedes registrar canceledAt cuando la suscripcion esta cancelada.',
      );
    }
  }

  private async ensureTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException('Empresa no encontrada.');
    }
  }

  private async findActiveSubscription(
    tenantId: string,
    id: string,
  ): Promise<SubscriptionResponse> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: subscriptionSelect,
    });

    if (!subscription) {
      throw new NotFoundException('Suscripcion no encontrada.');
    }

    return subscription;
  }

  async create(
    tenantId: string,
    createSubscriptionDto: CreateSubscriptionDto,
  ): Promise<SubscriptionResponse> {
    await this.ensureTenantExists(tenantId);

    const plan = (createSubscriptionDto.plan ?? 'FREE') as SubscriptionPlan;
    const status = (createSubscriptionDto.status ??
      'TRIALING') as SubscriptionStatus;
    const provider = (createSubscriptionDto.provider ??
      'STRIPE') as SubscriptionProvider;
    const currentPeriodStart = this.normalizeOptionalDate(
      createSubscriptionDto.currentPeriodStart,
    );
    const currentPeriodEnd = this.normalizeOptionalDate(
      createSubscriptionDto.currentPeriodEnd,
    );
    const trialEndsAt = this.normalizeOptionalDate(
      createSubscriptionDto.trialEndsAt,
    );
    const lastProviderEventAt = this.normalizeOptionalDate(
      createSubscriptionDto.lastProviderEventAt,
    );
    const canceledAt =
      createSubscriptionDto.canceledAt !== undefined
        ? this.normalizeOptionalDate(createSubscriptionDto.canceledAt)
        : status === SubscriptionStatus.CANCELED
          ? new Date()
          : null;

    this.validateDateRange(currentPeriodStart, currentPeriodEnd);
    this.validateCanceledState(status, canceledAt);

    const existing = await this.prisma.subscription.findFirst({
      where: { tenantId },
      select: { id: true, deletedAt: true },
    });

    const baseData = {
      plan,
      status,
      provider,
      providerCustomerId: this.normalizeOptionalString(
        createSubscriptionDto.providerCustomerId,
      ),
      providerSubscriptionId: this.normalizeOptionalString(
        createSubscriptionDto.providerSubscriptionId,
      ),
      paymentMethods:
        this.normalizePaymentMethods(createSubscriptionDto.paymentMethods) ?? [],
      currentPeriodStart,
      currentPeriodEnd,
      trialEndsAt,
      cancelAtPeriodEnd: createSubscriptionDto.cancelAtPeriodEnd ?? false,
      canceledAt,
      lastProviderEventAt,
      deletedAt: null,
    };

    try {
      if (existing) {
        if (existing.deletedAt === null) {
          throw new ConflictException(
            'La empresa ya tiene una suscripcion activa.',
          );
        }

        return await this.prisma.subscription.update({
          where: { id: existing.id },
          data: baseData,
          select: subscriptionSelect,
        });
      }

      return await this.prisma.subscription.create({
        data: {
          tenantId,
          ...baseData,
        },
        select: subscriptionSelect,
      });
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'La empresa ya tiene una suscripcion registrada.',
        );
      }

      throw new BadRequestException('No se pudo crear la suscripcion.');
    }
  }

  async findAll(tenantId: string): Promise<SubscriptionResponse[]> {
    return this.prisma.subscription.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: subscriptionSelect,
    });
  }

  async findOne(tenantId: string, id: string): Promise<SubscriptionResponse> {
    return this.findActiveSubscription(tenantId, id);
  }

  async update(
    tenantId: string,
    id: string,
    updateSubscriptionDto: UpdateSubscriptionDto,
  ): Promise<SubscriptionResponse> {
    const current = await this.findActiveSubscription(tenantId, id);

    const nextStatus = (updateSubscriptionDto.status ??
      current.status) as SubscriptionStatus;
    const currentPeriodStart =
      updateSubscriptionDto.currentPeriodStart !== undefined
        ? this.normalizeOptionalDate(updateSubscriptionDto.currentPeriodStart)
        : current.currentPeriodStart;
    const currentPeriodEnd =
      updateSubscriptionDto.currentPeriodEnd !== undefined
        ? this.normalizeOptionalDate(updateSubscriptionDto.currentPeriodEnd)
        : current.currentPeriodEnd;
    const canceledAt =
      updateSubscriptionDto.canceledAt !== undefined
        ? this.normalizeOptionalDate(updateSubscriptionDto.canceledAt)
        : nextStatus === SubscriptionStatus.CANCELED && current.canceledAt === null
          ? new Date()
          : current.canceledAt;

    this.validateDateRange(currentPeriodStart, currentPeriodEnd);
    this.validateCanceledState(nextStatus, canceledAt);

    try {
      return await this.prisma.subscription.update({
        where: { id },
        data: {
          plan:
            updateSubscriptionDto.plan !== undefined
              ? (updateSubscriptionDto.plan as SubscriptionPlan)
              : undefined,
          status:
            updateSubscriptionDto.status !== undefined
              ? (updateSubscriptionDto.status as SubscriptionStatus)
              : undefined,
          provider:
            updateSubscriptionDto.provider !== undefined
              ? (updateSubscriptionDto.provider as SubscriptionProvider)
              : undefined,
          providerCustomerId: this.normalizeOptionalString(
            updateSubscriptionDto.providerCustomerId,
          ),
          providerSubscriptionId: this.normalizeOptionalString(
            updateSubscriptionDto.providerSubscriptionId,
          ),
          paymentMethods:
            updateSubscriptionDto.paymentMethods !== undefined
              ? {
                  set:
                    this.normalizePaymentMethods(
                      updateSubscriptionDto.paymentMethods,
                    ) ?? [],
                }
              : undefined,
          currentPeriodStart:
            updateSubscriptionDto.currentPeriodStart !== undefined
              ? currentPeriodStart
              : undefined,
          currentPeriodEnd:
            updateSubscriptionDto.currentPeriodEnd !== undefined
              ? currentPeriodEnd
              : undefined,
          trialEndsAt:
            updateSubscriptionDto.trialEndsAt !== undefined
              ? this.normalizeOptionalDate(updateSubscriptionDto.trialEndsAt)
              : undefined,
          cancelAtPeriodEnd: updateSubscriptionDto.cancelAtPeriodEnd,
          canceledAt:
            updateSubscriptionDto.canceledAt !== undefined ||
            updateSubscriptionDto.status !== undefined
              ? canceledAt
              : undefined,
          lastProviderEventAt:
            updateSubscriptionDto.lastProviderEventAt !== undefined
              ? this.normalizeOptionalDate(
                  updateSubscriptionDto.lastProviderEventAt,
                )
              : undefined,
        },
        select: subscriptionSelect,
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('No se pudo actualizar la suscripcion.');
      }

      throw error;
    }
  }

  async remove(tenantId: string, id: string): Promise<{ ok: true }> {
    const current = await this.findActiveSubscription(tenantId, id);
    const deletedAt = new Date();

    await this.prisma.subscription.update({
      where: { id: current.id },
      data: {
        status: SubscriptionStatus.CANCELED,
        canceledAt: current.canceledAt ?? deletedAt,
        deletedAt,
      },
    });

    return { ok: true };
  }
}

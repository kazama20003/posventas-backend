import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FulfillOrderDto } from './dto/fulfill-order.dto';
import {
  CreateOrderDto,
  CreateOrderLineDto,
  CreateOrderPaymentDto,
  OrderPaymentProviderValue,
  OrderPaymentStatusValue,
  OrderUnitOfMeasureValue,
} from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

const MAIN_WAREHOUSE_CODE = 'MAIN';

const orderSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  customerId: true,
  code: true,
  status: true,
  totalAmount: true,
  taxAmount: true,
  discountAmount: true,
  idempotencyKey: true,
  createdAt: true,
  updatedAt: true,
  store: {
    select: {
      id: true,
      name: true,
      code: true,
      deletedAt: true,
    },
  },
  customer: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      deletedAt: true,
    },
  },
  lines: {
    where: {
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'asc' as const }],
    select: {
      id: true,
      variantId: true,
      unitOfMeasure: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      createdAt: true,
      variant: {
        select: {
          id: true,
          sku: true,
          barcode: true,
          unitOfMeasure: true,
          deletedAt: true,
          product: {
            select: {
              id: true,
              name: true,
              salePrice: true,
              taxRate: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  },
  payments: {
    where: {
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'asc' as const }],
    select: {
      id: true,
      amount: true,
      provider: true,
      providerRef: true,
      status: true,
      paidAt: true,
      createdAt: true,
    },
  },
} satisfies Prisma.OrderSelect;

type OrderRecord = Prisma.OrderGetPayload<{
  select: typeof orderSelect;
}>;

type ValidatedStore = {
  id: string;
  code: string | null;
};

type ValidatedCustomer = {
  id: string;
};

type ValidatedVariant = {
  id: string;
  unitOfMeasure: OrderUnitOfMeasureValue;
  salePrice: Prisma.Decimal;
  taxRate: Prisma.Decimal;
};

type ValidatedWarehouse = {
  id: string;
  storeId: string;
};

type NormalizedLine = {
  variantId: string;
  quantity: number;
  unitOfMeasure: OrderUnitOfMeasureValue;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
};

type NormalizedPayment = {
  amount: Prisma.Decimal;
  provider: PaymentProvider;
  providerRef: string | null | undefined;
  status: PaymentStatus;
  paidAt: Date | null;
};

type OrderResponse = {
  id: string;
  tenantId: string;
  storeId: string;
  customerId: string | null;
  code: string;
  status: OrderStatus;
  totalAmount: number;
  taxAmount: number;
  discountAmount: number;
  subtotalAmount: number;
  completedPaymentAmount: number;
  balanceDue: number;
  idempotencyKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  store: {
    id: string;
    name: string;
    code: string | null;
  } | null;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  lines: Array<{
    id: string;
    variantId: string;
    unitOfMeasure: OrderUnitOfMeasureValue;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    createdAt: Date;
    variant: {
      id: string;
      sku: string;
      barcode: string | null;
      unitOfMeasure: OrderUnitOfMeasureValue;
      product: {
        id: string;
        name: string;
        salePrice: number;
        taxRate: number;
      } | null;
    } | null;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    provider: OrderPaymentProviderValue;
    providerRef: string | null;
    status: OrderPaymentStatusValue;
    paidAt: Date | null;
    createdAt: Date;
  }>;
};

function uniqueTargetsFromError(
  e: Prisma.PrismaClientKnownRequestError,
): string[] {
  const target = e.meta?.target;

  if (Array.isArray(target)) {
    return target.filter((x): x is string => typeof x === 'string');
  }
  if (typeof target === 'string') {
    return [target];
  }
  return [];
}

function mapOrder(order: OrderRecord): OrderResponse {
  const subtotalAmount = order.lines.reduce(
    (sum, line) => sum + line.lineTotal.toNumber(),
    0,
  );
  const completedPaymentAmount = order.payments
    .filter((payment) => payment.status === PaymentStatus.COMPLETED)
    .reduce((sum, payment) => sum + payment.amount.toNumber(), 0);
  const totalAmount = order.totalAmount.toNumber();

  return {
    id: order.id,
    tenantId: order.tenantId,
    storeId: order.storeId,
    customerId: order.customerId,
    code: order.code,
    status: order.status,
    totalAmount,
    taxAmount: order.taxAmount.toNumber(),
    discountAmount: order.discountAmount.toNumber(),
    subtotalAmount,
    completedPaymentAmount,
    balanceDue: Math.max(totalAmount - completedPaymentAmount, 0),
    idempotencyKey: order.idempotencyKey,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    store:
      order.store.deletedAt === null
        ? {
            id: order.store.id,
            name: order.store.name,
            code: order.store.code,
          }
        : null,
    customer:
      order.customer && order.customer.deletedAt === null
        ? {
            id: order.customer.id,
            name: order.customer.name,
            email: order.customer.email,
            phone: order.customer.phone,
          }
        : null,
    lines: order.lines.map((line) => ({
      id: line.id,
      variantId: line.variantId,
      unitOfMeasure: line.unitOfMeasure as OrderUnitOfMeasureValue,
      quantity: line.quantity,
      unitPrice: line.unitPrice.toNumber(),
      lineTotal: line.lineTotal.toNumber(),
      createdAt: line.createdAt,
      variant:
        line.variant.deletedAt === null &&
        line.variant.product.deletedAt === null
          ? {
              id: line.variant.id,
              sku: line.variant.sku,
              barcode: line.variant.barcode,
              unitOfMeasure: line.variant
                .unitOfMeasure as OrderUnitOfMeasureValue,
              product: {
                id: line.variant.product.id,
                name: line.variant.product.name,
                salePrice: line.variant.product.salePrice.toNumber(),
                taxRate: line.variant.product.taxRate.toNumber(),
              },
            }
          : null,
    })),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount.toNumber(),
      provider: payment.provider as OrderPaymentProviderValue,
      providerRef: payment.providerRef,
      status: payment.status as OrderPaymentStatusValue,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
    })),
  };
}

@Injectable()
export class OrdersService {
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

  private normalizeCode(code: string | undefined): string | undefined {
    if (code === undefined) {
      return undefined;
    }

    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException(
        'El codigo del pedido no puede estar vacio.',
      );
    }

    return normalized;
  }

  private normalizeMoney(
    value: number | undefined,
    fieldName: string,
  ): Prisma.Decimal | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException(`${fieldName} debe ser un numero valido.`);
    }
    return new Prisma.Decimal(value);
  }

  private handleUniqueError(e: Prisma.PrismaClientKnownRequestError): never {
    const targets = uniqueTargetsFromError(e);

    if (
      targets.includes('tenantId,code') ||
      targets.includes('code') ||
      targets.includes('Order_tenantId_code_key')
    ) {
      throw new ConflictException(
        'Ya existe un pedido con ese codigo en esta empresa.',
      );
    }

    if (
      targets.includes('tenantId,idempotencyKey') ||
      targets.includes('idempotencyKey') ||
      targets.includes('Order_tenantId_idempotencyKey_key')
    ) {
      throw new ConflictException(
        'Ya existe un pedido con esa llave de idempotencia.',
      );
    }

    throw new ConflictException('Ya existe un pedido con datos unicos.');
  }

  private async validateStore(
    prismaClient: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    storeId: string,
  ): Promise<ValidatedStore> {
    const store = await prismaClient.store.findFirst({
      where: {
        id: storeId,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        code: true,
      },
    });

    if (!store) {
      throw new BadRequestException(
        'La tienda indicada no existe en esta empresa.',
      );
    }

    return store;
  }

  private async validateCustomer(
    prismaClient: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    customerId: string | undefined,
  ): Promise<ValidatedCustomer | undefined> {
    if (customerId === undefined) {
      return undefined;
    }

    const customer = await prismaClient.customer.findFirst({
      where: {
        id: customerId,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!customer) {
      throw new BadRequestException(
        'El cliente indicado no existe en esta empresa.',
      );
    }

    return customer;
  }

  private async validateVariants(
    prismaClient: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    lines: CreateOrderLineDto[],
  ): Promise<Map<string, ValidatedVariant>> {
    const variantIds = [...new Set(lines.map((line) => line.variantId))];
    const variants = await prismaClient.productVariant.findMany({
      where: {
        tenantId,
        id: {
          in: variantIds,
        },
        deletedAt: null,
        product: {
          is: {
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        unitOfMeasure: true,
        product: {
          select: {
            salePrice: true,
            taxRate: true,
          },
        },
      },
    });

    const variantMap = new Map<string, ValidatedVariant>(
      variants.map((variant) => [
        variant.id,
        {
          id: variant.id,
          unitOfMeasure: variant.unitOfMeasure as OrderUnitOfMeasureValue,
          salePrice: variant.product.salePrice,
          taxRate: variant.product.taxRate,
        },
      ]),
    );

    if (variantMap.size !== variantIds.length) {
      throw new BadRequestException(
        'Una o mas variantes indicadas no existen o no estan activas.',
      );
    }

    return variantMap;
  }

  private normalizeLines(
    lines: CreateOrderLineDto[],
    variants: Map<string, ValidatedVariant>,
  ): NormalizedLine[] {
    const seen = new Set<string>();

    return lines.map((line, index) => {
      if (seen.has(line.variantId)) {
        throw new BadRequestException(
          `La variante de la linea ${index + 1} esta repetida.`,
        );
      }
      seen.add(line.variantId);

      const variant = variants.get(line.variantId);
      if (!variant) {
        throw new BadRequestException(
          `La variante de la linea ${index + 1} no existe o no esta activa.`,
        );
      }

      const unitPrice =
        this.normalizeMoney(
          line.unitPrice,
          `El precio unitario de la linea ${index + 1}`,
        ) ?? variant.salePrice;
      const lineTotal = unitPrice.mul(line.quantity);
      const taxAmount = lineTotal.mul(variant.taxRate).div(100);

      return {
        variantId: line.variantId,
        quantity: line.quantity,
        unitOfMeasure: line.unitOfMeasure ?? variant.unitOfMeasure,
        unitPrice,
        lineTotal,
        taxAmount,
      };
    });
  }

  private normalizePayments(
    payments: CreateOrderPaymentDto[] | undefined,
  ): NormalizedPayment[] {
    if (payments === undefined) {
      return [];
    }

    return payments.map((payment, index) => {
      const amount = this.normalizeMoney(
        payment.amount,
        `El monto del pago ${index + 1}`,
      );

      if (!amount) {
        throw new BadRequestException(
          `El monto del pago ${index + 1} es obligatorio.`,
        );
      }

      const status =
        (payment.status as PaymentStatus | undefined) ??
        PaymentStatus.COMPLETED;
      const paidAt =
        payment.paidAt ??
        (status === PaymentStatus.COMPLETED ? new Date() : null);

      return {
        amount,
        provider: payment.provider as PaymentProvider,
        providerRef: this.normalizeOptionalString(payment.providerRef),
        status,
        paidAt,
      };
    });
  }

  private calculateTotals(
    lines: Array<{ lineTotal: Prisma.Decimal; taxAmount: Prisma.Decimal }>,
    discountAmount: Prisma.Decimal,
  ): {
    taxAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
  } {
    const subtotal = lines.reduce(
      (sum, line) => sum.add(line.lineTotal),
      new Prisma.Decimal(0),
    );
    const taxAmount = lines.reduce(
      (sum, line) => sum.add(line.taxAmount),
      new Prisma.Decimal(0),
    );
    const totalAmount = subtotal.add(taxAmount).sub(discountAmount);

    if (totalAmount.lessThan(0)) {
      throw new BadRequestException(
        'El descuento no puede dejar el total del pedido en negativo.',
      );
    }

    return { taxAmount, totalAmount };
  }

  private validatePaymentsAgainstTotal(
    payments: Array<{ amount: Prisma.Decimal; status: PaymentStatus }>,
    totalAmount: Prisma.Decimal,
  ): void {
    const completedAmount = payments
      .filter((payment) => payment.status === PaymentStatus.COMPLETED)
      .reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));

    if (completedAmount.greaterThan(totalAmount)) {
      throw new BadRequestException(
        'Los pagos completados no pueden exceder el total del pedido.',
      );
    }
  }

  private normalizeStatus(
    status: string | undefined,
    fallback: OrderStatus,
  ): OrderStatus {
    if (status === undefined) {
      return fallback;
    }

    return status as OrderStatus;
  }

  private async generateNextCode(
    tx: Prisma.TransactionClient,
    tenantId: string,
    store: ValidatedStore,
  ): Promise<string> {
    const key = `ORDER:STORE:${store.id}`;
    const sequence = await tx.sequence.upsert({
      where: {
        tenantId_key: {
          tenantId,
          key,
        },
      },
      create: {
        tenantId,
        key,
        value: 1,
      },
      update: {
        value: {
          increment: 1,
        },
      },
      select: {
        value: true,
      },
    });

    const prefix = (store.code ?? 'STORE').trim().toUpperCase() || 'STORE';
    return `ORD-${prefix}-${String(sequence.value).padStart(6, '0')}`;
  }

  private async resolveWarehouseForFulfillment(
    prismaClient: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    storeId: string,
    warehouseId: string | undefined,
  ): Promise<ValidatedWarehouse> {
    if (warehouseId) {
      const warehouse = await prismaClient.warehouse.findFirst({
        where: {
          id: warehouseId,
          tenantId,
          storeId,
          deletedAt: null,
        },
        select: {
          id: true,
          storeId: true,
        },
      });

      if (!warehouse) {
        throw new BadRequestException(
          'El almacen indicado no pertenece a la tienda del pedido.',
        );
      }

      return warehouse;
    }

    const warehouse =
      (await prismaClient.warehouse.findFirst({
        where: {
          tenantId,
          storeId,
          deletedAt: null,
          code: MAIN_WAREHOUSE_CODE,
        },
        select: {
          id: true,
          storeId: true,
        },
      })) ??
      (await prismaClient.warehouse.findFirst({
        where: {
          tenantId,
          storeId,
          deletedAt: null,
        },
        orderBy: [{ createdAt: 'asc' }],
        select: {
          id: true,
          storeId: true,
        },
      }));

    if (!warehouse) {
      throw new BadRequestException(
        'La tienda no tiene un almacen disponible para cumplir el pedido.',
      );
    }

    return warehouse;
  }

  private async findExistingOrder(
    tenantId: string,
    id: string,
  ): Promise<OrderRecord> {
    const order = await this.prisma.order.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: orderSelect,
    });

    if (!order) {
      throw new NotFoundException('Pedido no encontrado.');
    }

    return order;
  }

  async create(
    tenantId: string,
    createOrderDto: CreateOrderDto,
  ): Promise<OrderResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const store = await this.validateStore(
          tx,
          tenantId,
          createOrderDto.storeId,
        );
        const customer = await this.validateCustomer(
          tx,
          tenantId,
          createOrderDto.customerId,
        );
        const variants = await this.validateVariants(
          tx,
          tenantId,
          createOrderDto.lines,
        );
        const lines = this.normalizeLines(createOrderDto.lines, variants);
        const payments = this.normalizePayments(createOrderDto.payments);
        const discountAmount =
          this.normalizeMoney(createOrderDto.discountAmount, 'El descuento') ??
          new Prisma.Decimal(0);
        const { taxAmount, totalAmount } = this.calculateTotals(
          lines,
          discountAmount,
        );
        this.validatePaymentsAgainstTotal(payments, totalAmount);

        const order = await tx.order.create({
          data: {
            tenantId,
            storeId: store.id,
            customerId: customer?.id,
            code:
              this.normalizeCode(createOrderDto.code) ??
              (await this.generateNextCode(tx, tenantId, store)),
            status: this.normalizeStatus(
              createOrderDto.status,
              payments.some(
                (payment) => payment.status === PaymentStatus.COMPLETED,
              )
                ? OrderStatus.CONFIRMED
                : OrderStatus.PENDING,
            ),
            totalAmount,
            taxAmount,
            discountAmount,
            idempotencyKey: this.normalizeOptionalString(
              createOrderDto.idempotencyKey,
            ),
            lines: {
              create: lines.map((line) => ({
                variantId: line.variantId,
                unitOfMeasure: line.unitOfMeasure,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                lineTotal: line.lineTotal,
              })),
            },
            payments:
              payments.length > 0
                ? {
                    create: payments.map((payment) => ({
                      tenantId,
                      amount: payment.amount,
                      provider: payment.provider,
                      providerRef: payment.providerRef,
                      status: payment.status,
                      paidAt: payment.paidAt,
                    })),
                  }
                : undefined,
          },
          select: orderSelect,
        });

        return mapOrder(order);
      });
    } catch (e: unknown) {
      if (e instanceof BadRequestException || e instanceof ConflictException) {
        throw e;
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        this.handleUniqueError(e);
      }
      throw new BadRequestException('No se pudo crear el pedido.');
    }
  }

  async findAll(tenantId: string): Promise<OrderResponse[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }],
      select: orderSelect,
    });

    return orders.map(mapOrder);
  }

  async findOne(tenantId: string, id: string): Promise<OrderResponse> {
    const order = await this.findExistingOrder(tenantId, id);
    return mapOrder(order);
  }

  async update(
    tenantId: string,
    id: string,
    updateOrderDto: UpdateOrderDto,
  ): Promise<OrderResponse> {
    const existingOrder = await this.findExistingOrder(tenantId, id);

    if (
      existingOrder.status === OrderStatus.FULFILLED ||
      existingOrder.status === OrderStatus.CANCELED
    ) {
      throw new BadRequestException(
        'No puedes editar un pedido cancelado o ya cumplido.',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const store =
          updateOrderDto.storeId !== undefined
            ? await this.validateStore(tx, tenantId, updateOrderDto.storeId)
            : undefined;
        const customer =
          updateOrderDto.customerId !== undefined
            ? await this.validateCustomer(
                tx,
                tenantId,
                updateOrderDto.customerId,
              )
            : undefined;
        const variants =
          updateOrderDto.lines !== undefined
            ? await this.validateVariants(tx, tenantId, updateOrderDto.lines)
            : undefined;
        const normalizedLines =
          updateOrderDto.lines !== undefined && variants
            ? this.normalizeLines(updateOrderDto.lines, variants)
            : undefined;
        const normalizedPayments =
          updateOrderDto.payments !== undefined
            ? this.normalizePayments(updateOrderDto.payments)
            : undefined;
        const discountAmount =
          this.normalizeMoney(updateOrderDto.discountAmount, 'El descuento') ??
          existingOrder.discountAmount;
        const baseLinesForTotals =
          normalizedLines ??
          existingOrder.lines.map((line) => ({
            lineTotal: line.lineTotal,
            taxAmount: line.lineTotal
              .mul(line.variant.product.taxRate)
              .div(100),
          }));
        const { taxAmount, totalAmount } = this.calculateTotals(
          baseLinesForTotals,
          discountAmount,
        );
        this.validatePaymentsAgainstTotal(
          normalizedPayments ??
            existingOrder.payments.map((payment) => ({
              amount: payment.amount,
              status: payment.status,
            })),
          totalAmount,
        );

        if (normalizedLines !== undefined) {
          await tx.orderLine.updateMany({
            where: {
              orderId: id,
              deletedAt: null,
            },
            data: {
              deletedAt: new Date(),
            },
          });
        }

        if (normalizedPayments !== undefined) {
          await tx.payment.updateMany({
            where: {
              tenantId,
              orderId: id,
              deletedAt: null,
            },
            data: {
              deletedAt: new Date(),
            },
          });
        }

        const order = await tx.order.update({
          where: { id },
          data: {
            storeId: store?.id,
            customerId:
              updateOrderDto.customerId !== undefined
                ? (customer?.id ?? null)
                : undefined,
            code: this.normalizeCode(updateOrderDto.code),
            status:
              updateOrderDto.status !== undefined
                ? (updateOrderDto.status as OrderStatus)
                : undefined,
            totalAmount,
            taxAmount,
            discountAmount,
            idempotencyKey: this.normalizeOptionalString(
              updateOrderDto.idempotencyKey,
            ),
            version: {
              increment: 1,
            },
            lines:
              normalizedLines !== undefined
                ? {
                    create: normalizedLines.map((line) => ({
                      variantId: line.variantId,
                      unitOfMeasure: line.unitOfMeasure,
                      quantity: line.quantity,
                      unitPrice: line.unitPrice,
                      lineTotal: line.lineTotal,
                    })),
                  }
                : undefined,
            payments:
              normalizedPayments !== undefined
                ? {
                    create: normalizedPayments.map((payment) => ({
                      tenantId,
                      amount: payment.amount,
                      provider: payment.provider,
                      providerRef: payment.providerRef,
                      status: payment.status,
                      paidAt: payment.paidAt,
                    })),
                  }
                : undefined,
          },
          select: orderSelect,
        });

        return mapOrder(order);
      });
    } catch (e: unknown) {
      if (e instanceof BadRequestException || e instanceof ConflictException) {
        throw e;
      }
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        this.handleUniqueError(e);
      }
      throw new BadRequestException('No se pudo actualizar el pedido.');
    }
  }

  async fulfill(
    tenantId: string,
    userId: string,
    id: string,
    fulfillOrderDto: FulfillOrderDto,
  ): Promise<OrderResponse> {
    const existingOrder = await this.findExistingOrder(tenantId, id);

    if (existingOrder.status === OrderStatus.FULFILLED) {
      throw new BadRequestException('El pedido ya fue cumplido.');
    }

    if (existingOrder.status === OrderStatus.CANCELED) {
      throw new BadRequestException('No puedes cumplir un pedido cancelado.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const warehouse = await this.resolveWarehouseForFulfillment(
          tx,
          tenantId,
          existingOrder.storeId,
          fulfillOrderDto.warehouseId,
        );

        for (const line of existingOrder.lines) {
          const inventory = await tx.inventory.findUnique({
            where: {
              variantId_warehouseId: {
                variantId: line.variantId,
                warehouseId: warehouse.id,
              },
            },
            select: {
              id: true,
              quantity: true,
              reserved: true,
              deletedAt: true,
            },
          });

          if (!inventory || inventory.deletedAt !== null) {
            throw new BadRequestException(
              `No hay inventario activo para la variante ${line.variant.sku} en el almacen seleccionado.`,
            );
          }

          const nextQuantity = inventory.quantity - line.quantity;

          if (nextQuantity < 0) {
            throw new BadRequestException(
              `Stock insuficiente para la variante ${line.variant.sku}.`,
            );
          }

          if (nextQuantity < inventory.reserved) {
            throw new BadRequestException(
              `La salida deja la variante ${line.variant.sku} por debajo de lo reservado.`,
            );
          }

          await tx.inventory.update({
            where: {
              id: inventory.id,
            },
            data: {
              quantity: nextQuantity,
            },
          });

          await tx.inventoryMovement.create({
            data: {
              tenantId,
              variantId: line.variantId,
              warehouseId: warehouse.id,
              delta: -line.quantity,
              reason: `Venta ${existingOrder.code}.`,
              referenceId: existingOrder.id,
              createdById: userId,
            },
          });
        }

        const order = await tx.order.update({
          where: { id },
          data: {
            status: OrderStatus.FULFILLED,
            version: {
              increment: 1,
            },
          },
          select: orderSelect,
        });

        return mapOrder(order);
      });
    } catch (e: unknown) {
      if (e instanceof BadRequestException || e instanceof ConflictException) {
        throw e;
      }
      throw new BadRequestException('No se pudo cumplir el pedido.');
    }
  }

  async remove(tenantId: string, id: string): Promise<{ ok: true }> {
    const existingOrder = await this.findExistingOrder(tenantId, id);

    if (existingOrder.status === OrderStatus.FULFILLED) {
      throw new BadRequestException(
        'No puedes eliminar un pedido que ya fue cumplido.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderLine.updateMany({
        where: {
          orderId: id,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      await tx.payment.updateMany({
        where: {
          tenantId,
          orderId: id,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      await tx.order.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      });
    });

    return { ok: true };
  }
}

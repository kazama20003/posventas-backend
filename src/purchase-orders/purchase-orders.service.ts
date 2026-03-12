import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePurchaseOrderDto,
  CreatePurchaseOrderLineDto,
  PurchaseOrderUnitOfMeasureValue,
} from './dto/create-purchase-order.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';

const purchaseOrderSelect = {
  id: true,
  tenantId: true,
  supplierId: true,
  storeId: true,
  code: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  supplier: {
    select: {
      id: true,
      name: true,
      contact: true,
      deletedAt: true,
    },
  },
  store: {
    select: {
      id: true,
      name: true,
      code: true,
      deletedAt: true,
    },
  },
  lines: {
    where: {
      deletedAt: null,
    },
    orderBy: [{ id: 'asc' as const }],
    select: {
      id: true,
      variantId: true,
      quantity: true,
      unitCost: true,
      unitOfMeasure: true,
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
              deletedAt: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.PurchaseOrderSelect;

type PurchaseOrderRecord = Prisma.PurchaseOrderGetPayload<{
  select: typeof purchaseOrderSelect;
}>;

type PurchaseOrderLineResponse = {
  id: string;
  variantId: string;
  quantity: number;
  unitCost: number;
  unitOfMeasure: PurchaseOrderUnitOfMeasureValue;
  lineTotal: number;
  variant: {
    id: string;
    sku: string;
    barcode: string | null;
    unitOfMeasure: PurchaseOrderUnitOfMeasureValue;
    product: {
      id: string;
      name: string;
    } | null;
  } | null;
};

type PurchaseOrderResponse = {
  id: string;
  tenantId: string;
  supplierId: string;
  storeId: string | null;
  code: string;
  status: PurchaseOrderStatus;
  totalCost: number;
  createdAt: Date;
  updatedAt: Date;
  supplier: {
    id: string;
    name: string;
    contact: string | null;
  } | null;
  store: {
    id: string;
    name: string;
    code: string | null;
  } | null;
  lines: PurchaseOrderLineResponse[];
};

type ValidatedStore = {
  id: string;
  code: string | null;
};

type ValidatedWarehouse = {
  id: string;
  storeId: string;
};

type ValidatedVariant = {
  id: string;
  unitOfMeasure: PurchaseOrderUnitOfMeasureValue;
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

function mapPurchaseOrder(
  purchaseOrder: PurchaseOrderRecord,
): PurchaseOrderResponse {
  const lines = purchaseOrder.lines.map((line) => ({
    id: line.id,
    variantId: line.variantId,
    quantity: line.quantity,
    unitCost: line.unitCost.toNumber(),
    unitOfMeasure: line.unitOfMeasure as PurchaseOrderUnitOfMeasureValue,
    lineTotal: line.unitCost.mul(line.quantity).toNumber(),
    variant:
      line.variant.deletedAt === null && line.variant.product.deletedAt === null
        ? {
            id: line.variant.id,
            sku: line.variant.sku,
            barcode: line.variant.barcode,
            unitOfMeasure: line.variant
              .unitOfMeasure as PurchaseOrderUnitOfMeasureValue,
            product: {
              id: line.variant.product.id,
              name: line.variant.product.name,
            },
          }
        : null,
  }));

  return {
    id: purchaseOrder.id,
    tenantId: purchaseOrder.tenantId,
    supplierId: purchaseOrder.supplierId,
    storeId: purchaseOrder.storeId,
    code: purchaseOrder.code,
    status: purchaseOrder.status,
    totalCost: lines.reduce((sum, line) => sum + line.lineTotal, 0),
    createdAt: purchaseOrder.createdAt,
    updatedAt: purchaseOrder.updatedAt,
    supplier:
      purchaseOrder.supplier.deletedAt === null
        ? {
            id: purchaseOrder.supplier.id,
            name: purchaseOrder.supplier.name,
            contact: purchaseOrder.supplier.contact,
          }
        : null,
    store:
      purchaseOrder.store && purchaseOrder.store.deletedAt === null
        ? {
            id: purchaseOrder.store.id,
            name: purchaseOrder.store.name,
            code: purchaseOrder.store.code,
          }
        : null,
    lines,
  };
}

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCode(code: string | undefined): string | undefined {
    if (code === undefined) {
      return undefined;
    }

    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException(
        'El codigo de la orden de compra no puede estar vacio.',
      );
    }
    return normalized;
  }

  private normalizeMoney(value: number, fieldName: string): Prisma.Decimal {
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException(`${fieldName} debe ser un numero valido.`);
    }
    return new Prisma.Decimal(value);
  }

  private normalizeLines(
    lines: CreatePurchaseOrderLineDto[],
    variants: Map<string, ValidatedVariant>,
  ): Array<{
    variantId: string;
    quantity: number;
    unitCost: Prisma.Decimal;
    unitOfMeasure: PurchaseOrderUnitOfMeasureValue;
  }> {
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

      return {
        variantId: line.variantId,
        quantity: line.quantity,
        unitCost: this.normalizeMoney(
          line.unitCost,
          `El costo unitario de la linea ${index + 1}`,
        ),
        unitOfMeasure: line.unitOfMeasure ?? variant.unitOfMeasure,
      };
    });
  }

  private handleUniqueError(e: Prisma.PrismaClientKnownRequestError): never {
    const targets = uniqueTargetsFromError(e);

    if (
      targets.includes('code') ||
      targets.includes('tenantId,code') ||
      targets.includes('PurchaseOrder_tenantId_code_key')
    ) {
      throw new ConflictException(
        'Ya existe una orden de compra con ese codigo en esta empresa.',
      );
    }

    throw new ConflictException(
      'Ya existe una orden de compra con datos unicos.',
    );
  }

  private async validateSupplier(
    prismaClient: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    supplierId: string,
  ): Promise<string> {
    const supplier = await prismaClient.supplier.findFirst({
      where: {
        id: supplierId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!supplier) {
      throw new BadRequestException(
        'El proveedor indicado no existe en esta empresa.',
      );
    }

    return supplier.id;
  }

  private async validateStore(
    prismaClient: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    storeId: string | undefined | null,
  ): Promise<ValidatedStore | null | undefined> {
    if (storeId === undefined) {
      return undefined;
    }

    if (storeId === null) {
      return null;
    }

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

  private async validateWarehouse(
    prismaClient: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    warehouseId: string,
  ): Promise<ValidatedWarehouse> {
    const warehouse = await prismaClient.warehouse.findFirst({
      where: {
        id: warehouseId,
        tenantId,
        deletedAt: null,
        store: {
          is: {
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        storeId: true,
      },
    });

    if (!warehouse) {
      throw new BadRequestException(
        'El almacen indicado no existe o no esta activo en esta empresa.',
      );
    }

    return warehouse;
  }

  private async validateVariants(
    prismaClient: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    lines: CreatePurchaseOrderLineDto[],
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
      },
    });

    const variantMap = new Map<string, ValidatedVariant>(
      variants.map((variant) => [
        variant.id,
        {
          id: variant.id,
          unitOfMeasure:
            variant.unitOfMeasure as PurchaseOrderUnitOfMeasureValue,
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

  private async generateNextCode(
    tx: Prisma.TransactionClient,
    tenantId: string,
    store: ValidatedStore | null,
  ): Promise<string> {
    const key = store ? `PO:STORE:${store.id}` : 'PO:TENANT';
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

    const prefix = (store?.code ?? 'GEN').trim().toUpperCase() || 'GEN';
    return `PO-${prefix}-${String(sequence.value).padStart(6, '0')}`;
  }

  private async findExistingOrder(
    tenantId: string,
    id: string,
  ): Promise<PurchaseOrderRecord> {
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: purchaseOrderSelect,
    });

    if (!purchaseOrder) {
      throw new NotFoundException('Orden de compra no encontrada.');
    }

    return purchaseOrder;
  }

  async create(
    tenantId: string,
    dto: CreatePurchaseOrderDto,
  ): Promise<PurchaseOrderResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const supplierId = await this.validateSupplier(
          tx,
          tenantId,
          dto.supplierId,
        );
        const store = await this.validateStore(tx, tenantId, dto.storeId);
        const variants = await this.validateVariants(tx, tenantId, dto.lines);
        const lines = this.normalizeLines(dto.lines, variants);
        const code =
          this.normalizeCode(dto.code) ??
          (await this.generateNextCode(tx, tenantId, store ?? null));

        const purchaseOrder = await tx.purchaseOrder.create({
          data: {
            tenantId,
            supplierId,
            storeId: store?.id ?? null,
            code,
            lines: {
              create: lines,
            },
          },
          select: purchaseOrderSelect,
        });

        return mapPurchaseOrder(purchaseOrder);
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
      throw new BadRequestException('No se pudo crear la orden de compra.');
    }
  }

  async findAll(tenantId: string): Promise<PurchaseOrderResponse[]> {
    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }],
      select: purchaseOrderSelect,
    });

    return purchaseOrders.map(mapPurchaseOrder);
  }

  async findOne(tenantId: string, id: string): Promise<PurchaseOrderResponse> {
    const purchaseOrder = await this.findExistingOrder(tenantId, id);
    return mapPurchaseOrder(purchaseOrder);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdatePurchaseOrderDto,
  ): Promise<PurchaseOrderResponse> {
    const existingOrder = await this.findExistingOrder(tenantId, id);

    if (existingOrder.status !== PurchaseOrderStatus.PENDING) {
      throw new BadRequestException(
        'Solo puedes editar ordenes de compra pendientes.',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const supplierId =
          dto.supplierId !== undefined
            ? await this.validateSupplier(tx, tenantId, dto.supplierId)
            : undefined;
        const store = await this.validateStore(tx, tenantId, dto.storeId);
        const variants =
          dto.lines !== undefined
            ? await this.validateVariants(tx, tenantId, dto.lines)
            : undefined;
        const lines =
          dto.lines !== undefined && variants
            ? this.normalizeLines(dto.lines, variants)
            : undefined;

        if (lines !== undefined) {
          await tx.purchaseOrderLine.updateMany({
            where: {
              purchaseOrderId: id,
              deletedAt: null,
            },
            data: {
              deletedAt: new Date(),
            },
          });
        }

        const purchaseOrder = await tx.purchaseOrder.update({
          where: { id },
          data: {
            supplierId,
            storeId: store === undefined ? undefined : (store?.id ?? null),
            code: this.normalizeCode(dto.code),
            status:
              dto.status !== undefined
                ? PurchaseOrderStatus.CANCELED
                : undefined,
            lines:
              lines !== undefined
                ? {
                    create: lines,
                  }
                : undefined,
          },
          select: purchaseOrderSelect,
        });

        return mapPurchaseOrder(purchaseOrder);
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
      throw new BadRequestException(
        'No se pudo actualizar la orden de compra.',
      );
    }
  }

  async receive(
    tenantId: string,
    userId: string,
    id: string,
    dto: ReceivePurchaseOrderDto,
  ): Promise<PurchaseOrderResponse> {
    const existingOrder = await this.findExistingOrder(tenantId, id);

    if (existingOrder.status !== PurchaseOrderStatus.PENDING) {
      throw new BadRequestException(
        'Solo puedes recibir ordenes de compra pendientes.',
      );
    }

    if (existingOrder.lines.length === 0) {
      throw new BadRequestException(
        'La orden de compra no tiene lineas para recepcionar.',
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const warehouse = await this.validateWarehouse(
          tx,
          tenantId,
          dto.warehouseId,
        );

        if (
          existingOrder.storeId !== null &&
          warehouse.storeId !== existingOrder.storeId
        ) {
          throw new BadRequestException(
            'El almacen de recepcion no pertenece a la tienda de la orden.',
          );
        }

        for (const line of existingOrder.lines) {
          const inventory = await tx.inventory.upsert({
            where: {
              variantId_warehouseId: {
                variantId: line.variantId,
                warehouseId: warehouse.id,
              },
            },
            create: {
              tenantId,
              variantId: line.variantId,
              warehouseId: warehouse.id,
              quantity: 0,
              reserved: 0,
            },
            update: {
              deletedAt: null,
            },
            select: {
              id: true,
              quantity: true,
            },
          });

          await tx.inventory.update({
            where: {
              id: inventory.id,
            },
            data: {
              quantity: inventory.quantity + line.quantity,
            },
          });

          await tx.inventoryMovement.create({
            data: {
              tenantId,
              variantId: line.variantId,
              warehouseId: warehouse.id,
              delta: line.quantity,
              reason: `Recepcion de orden de compra ${existingOrder.code}.`,
              referenceId: existingOrder.id,
              createdById: userId,
            },
          });
        }

        const purchaseOrder = await tx.purchaseOrder.update({
          where: { id },
          data: {
            status: PurchaseOrderStatus.RECEIVED,
          },
          select: purchaseOrderSelect,
        });

        return mapPurchaseOrder(purchaseOrder);
      });
    } catch (e: unknown) {
      if (e instanceof BadRequestException || e instanceof ConflictException) {
        throw e;
      }
      throw new BadRequestException(
        'No se pudo recepcionar la orden de compra.',
      );
    }
  }

  async remove(tenantId: string, id: string): Promise<{ ok: true }> {
    const existingOrder = await this.findExistingOrder(tenantId, id);

    if (existingOrder.status === PurchaseOrderStatus.RECEIVED) {
      throw new BadRequestException(
        'No puedes eliminar una orden de compra ya recepcionada.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrderLine.updateMany({
        where: {
          purchaseOrderId: id,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      await tx.purchaseOrder.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      });
    });

    return { ok: true };
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';

const inventorySelect = {
  id: true,
  tenantId: true,
  variantId: true,
  warehouseId: true,
  quantity: true,
  reserved: true,
  updatedAt: true,
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
  warehouse: {
    select: {
      id: true,
      name: true,
      code: true,
      deletedAt: true,
      store: {
        select: {
          id: true,
          name: true,
          code: true,
          deletedAt: true,
        },
      },
    },
  },
} satisfies Prisma.InventorySelect;

const movementSelect = {
  id: true,
  tenantId: true,
  variantId: true,
  warehouseId: true,
  delta: true,
  reason: true,
  referenceId: true,
  createdById: true,
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
          deletedAt: true,
        },
      },
    },
  },
  warehouse: {
    select: {
      id: true,
      name: true,
      code: true,
      deletedAt: true,
      store: {
        select: {
          id: true,
          name: true,
          code: true,
          deletedAt: true,
        },
      },
    },
  },
  createdBy: {
    select: {
      id: true,
      email: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.InventoryMovementSelect;

type InventoryRecord = Prisma.InventoryGetPayload<{
  select: typeof inventorySelect;
}>;

type InventoryMovementRecord = Prisma.InventoryMovementGetPayload<{
  select: typeof movementSelect;
}>;

type InventoryResponse = {
  id: string;
  tenantId: string;
  variantId: string;
  warehouseId: string;
  quantity: number;
  reserved: number;
  available: number;
  updatedAt: Date;
  variant: {
    id: string;
    sku: string;
    barcode: string | null;
    unitOfMeasure: string;
    product: {
      id: string;
      name: string;
    } | null;
  } | null;
  warehouse: {
    id: string;
    name: string;
    code: string | null;
    store: {
      id: string;
      name: string;
      code: string | null;
    } | null;
  } | null;
};

type InventoryMovementResponse = {
  id: string;
  tenantId: string;
  variantId: string;
  warehouseId: string;
  delta: number;
  reason: string;
  referenceId: string | null;
  createdById: string | null;
  createdAt: Date;
  variant: InventoryResponse['variant'];
  warehouse: InventoryResponse['warehouse'];
  createdBy: {
    id: string;
    email: string;
  } | null;
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

function mapInventory(inventory: InventoryRecord): InventoryResponse {
  return {
    id: inventory.id,
    tenantId: inventory.tenantId,
    variantId: inventory.variantId,
    warehouseId: inventory.warehouseId,
    quantity: inventory.quantity,
    reserved: inventory.reserved,
    available: inventory.quantity - inventory.reserved,
    updatedAt: inventory.updatedAt,
    variant:
      inventory.variant.deletedAt === null &&
      inventory.variant.product.deletedAt === null
        ? {
            id: inventory.variant.id,
            sku: inventory.variant.sku,
            barcode: inventory.variant.barcode,
            unitOfMeasure: inventory.variant.unitOfMeasure,
            product: {
              id: inventory.variant.product.id,
              name: inventory.variant.product.name,
            },
          }
        : null,
    warehouse:
      inventory.warehouse.deletedAt === null &&
      inventory.warehouse.store.deletedAt === null
        ? {
            id: inventory.warehouse.id,
            name: inventory.warehouse.name,
            code: inventory.warehouse.code,
            store: {
              id: inventory.warehouse.store.id,
              name: inventory.warehouse.store.name,
              code: inventory.warehouse.store.code,
            },
          }
        : null,
  };
}

function mapMovement(
  movement: InventoryMovementRecord,
): InventoryMovementResponse {
  return {
    id: movement.id,
    tenantId: movement.tenantId,
    variantId: movement.variantId,
    warehouseId: movement.warehouseId,
    delta: movement.delta,
    reason: movement.reason,
    referenceId: movement.referenceId,
    createdById: movement.createdById,
    createdAt: movement.createdAt,
    variant:
      movement.variant.deletedAt === null &&
      movement.variant.product.deletedAt === null
        ? {
            id: movement.variant.id,
            sku: movement.variant.sku,
            barcode: movement.variant.barcode,
            unitOfMeasure: movement.variant.unitOfMeasure,
            product: {
              id: movement.variant.product.id,
              name: movement.variant.product.name,
            },
          }
        : null,
    warehouse:
      movement.warehouse.deletedAt === null &&
      movement.warehouse.store.deletedAt === null
        ? {
            id: movement.warehouse.id,
            name: movement.warehouse.name,
            code: movement.warehouse.code,
            store: {
              id: movement.warehouse.store.id,
              name: movement.warehouse.store.name,
              code: movement.warehouse.store.code,
            },
          }
        : null,
    createdBy:
      movement.createdBy && movement.createdBy.deletedAt === null
        ? {
            id: movement.createdBy.id,
            email: movement.createdBy.email,
          }
        : null,
  };
}

@Injectable()
export class InventoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeReason(
    reason: string | undefined,
    fallback: string,
  ): string {
    const normalized = (reason ?? fallback).trim();
    if (!normalized) {
      throw new BadRequestException('El motivo del movimiento es obligatorio.');
    }
    return normalized;
  }

  private normalizeReferenceId(
    referenceId: string | undefined,
  ): string | null | undefined {
    if (referenceId === undefined) {
      return undefined;
    }

    const normalized = referenceId.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private validateInventoryLevels(quantity: number, reserved: number): void {
    if (reserved > quantity) {
      throw new BadRequestException(
        'La cantidad reservada no puede ser mayor que la cantidad disponible.',
      );
    }
  }

  private handleUniqueError(e: Prisma.PrismaClientKnownRequestError): never {
    const targets = uniqueTargetsFromError(e);
    if (
      targets.includes('variantId,warehouseId') ||
      targets.includes('Inventory_variantId_warehouseId_key')
    ) {
      throw new ConflictException(
        'Ya existe inventario para esa variante en ese almacen.',
      );
    }
    throw new ConflictException('Ya existe inventario con datos unicos.');
  }

  private async validateVariantAndWarehouse(
    prismaClient: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    variantId: string,
    warehouseId: string,
  ): Promise<void> {
    const [variant, warehouse] = await Promise.all([
      prismaClient.productVariant.findFirst({
        where: {
          id: variantId,
          tenantId,
          deletedAt: null,
          product: {
            is: {
              deletedAt: null,
            },
          },
        },
        select: { id: true },
      }),
      prismaClient.warehouse.findFirst({
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
        select: { id: true },
      }),
    ]);

    if (!variant) {
      throw new BadRequestException(
        'La variante indicada no existe o no esta activa en esta empresa.',
      );
    }

    if (!warehouse) {
      throw new BadRequestException(
        'El almacen indicado no existe o no esta activo en esta empresa.',
      );
    }
  }

  private async createMovementRecord(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    data: {
      variantId: string;
      warehouseId: string;
      delta: number;
      reason: string;
      referenceId?: string;
    },
  ): Promise<void> {
    await tx.inventoryMovement.create({
      data: {
        tenantId,
        variantId: data.variantId,
        warehouseId: data.warehouseId,
        delta: data.delta,
        reason: data.reason,
        referenceId: this.normalizeReferenceId(data.referenceId),
        createdById: userId,
      },
    });
  }

  async create(
    tenantId: string,
    userId: string,
    createInventoryDto: CreateInventoryDto,
  ): Promise<InventoryResponse> {
    await this.validateVariantAndWarehouse(
      this.prisma,
      tenantId,
      createInventoryDto.variantId,
      createInventoryDto.warehouseId,
    );

    const quantity = createInventoryDto.quantity ?? 0;
    const reserved = createInventoryDto.reserved ?? 0;
    this.validateInventoryLevels(quantity, reserved);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingInventory = await tx.inventory.findUnique({
          where: {
            variantId_warehouseId: {
              variantId: createInventoryDto.variantId,
              warehouseId: createInventoryDto.warehouseId,
            },
          },
          select: {
            quantity: true,
          },
        });

        const inventory = await tx.inventory.upsert({
          where: {
            variantId_warehouseId: {
              variantId: createInventoryDto.variantId,
              warehouseId: createInventoryDto.warehouseId,
            },
          },
          create: {
            tenantId,
            variantId: createInventoryDto.variantId,
            warehouseId: createInventoryDto.warehouseId,
            quantity,
            reserved,
          },
          update: {
            deletedAt: null,
            quantity,
            reserved,
          },
          select: inventorySelect,
        });

        const delta = quantity - (existingInventory?.quantity ?? 0);

        if (delta !== 0) {
          await this.createMovementRecord(tx, tenantId, userId, {
            variantId: createInventoryDto.variantId,
            warehouseId: createInventoryDto.warehouseId,
            delta,
            reason: this.normalizeReason(
              createInventoryDto.reason,
              'Inventario inicial.',
            ),
            referenceId: createInventoryDto.referenceId,
          });
        }

        return mapInventory(inventory);
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
      throw new BadRequestException('No se pudo crear el inventario.');
    }
  }

  async findAll(tenantId: string): Promise<InventoryResponse[]> {
    const inventories = await this.prisma.inventory.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: [{ updatedAt: 'desc' }],
      select: inventorySelect,
    });

    return inventories.map(mapInventory);
  }

  async findOne(tenantId: string, id: string): Promise<InventoryResponse> {
    const inventory = await this.prisma.inventory.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: inventorySelect,
    });

    if (!inventory) {
      throw new NotFoundException('Inventario no encontrado.');
    }

    return mapInventory(inventory);
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    updateInventoryDto: UpdateInventoryDto,
  ): Promise<InventoryResponse> {
    const existingInventory = await this.prisma.inventory.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        variantId: true,
        warehouseId: true,
        quantity: true,
        reserved: true,
      },
    });

    if (!existingInventory) {
      throw new NotFoundException('Inventario no encontrado.');
    }

    const quantity = updateInventoryDto.quantity ?? existingInventory.quantity;
    const reserved = updateInventoryDto.reserved ?? existingInventory.reserved;
    this.validateInventoryLevels(quantity, reserved);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const inventory = await tx.inventory.update({
          where: { id },
          data: {
            quantity,
            reserved,
          },
          select: inventorySelect,
        });

        const delta = quantity - existingInventory.quantity;

        if (delta !== 0) {
          await this.createMovementRecord(tx, tenantId, userId, {
            variantId: existingInventory.variantId,
            warehouseId: existingInventory.warehouseId,
            delta,
            reason: this.normalizeReason(
              updateInventoryDto.reason,
              'Ajuste manual de inventario.',
            ),
            referenceId: updateInventoryDto.referenceId,
          });
        }

        return mapInventory(inventory);
      });
    } catch (e: unknown) {
      if (e instanceof BadRequestException || e instanceof ConflictException) {
        throw e;
      }
      throw new BadRequestException('No se pudo actualizar el inventario.');
    }
  }

  async remove(tenantId: string, id: string): Promise<{ ok: true }> {
    const inventory = await this.prisma.inventory.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        quantity: true,
        reserved: true,
      },
    });

    if (!inventory) {
      throw new NotFoundException('Inventario no encontrado.');
    }

    if (inventory.quantity > 0 || inventory.reserved > 0) {
      throw new BadRequestException(
        'No puedes eliminar un inventario que tiene stock o reserva activa.',
      );
    }

    await this.prisma.inventory.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    return { ok: true };
  }

  async createMovement(
    tenantId: string,
    userId: string,
    createInventoryMovementDto: CreateInventoryMovementDto,
  ): Promise<InventoryMovementResponse> {
    if (createInventoryMovementDto.delta === 0) {
      throw new BadRequestException(
        'El delta del movimiento no puede ser cero.',
      );
    }

    await this.validateVariantAndWarehouse(
      this.prisma,
      tenantId,
      createInventoryMovementDto.variantId,
      createInventoryMovementDto.warehouseId,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const inventory = await tx.inventory.upsert({
          where: {
            variantId_warehouseId: {
              variantId: createInventoryMovementDto.variantId,
              warehouseId: createInventoryMovementDto.warehouseId,
            },
          },
          create: {
            tenantId,
            variantId: createInventoryMovementDto.variantId,
            warehouseId: createInventoryMovementDto.warehouseId,
            quantity: 0,
            reserved: 0,
          },
          update: {
            deletedAt: null,
          },
          select: {
            id: true,
            quantity: true,
            reserved: true,
          },
        });

        const nextQuantity =
          inventory.quantity + createInventoryMovementDto.delta;

        if (nextQuantity < 0) {
          throw new BadRequestException(
            'El movimiento deja el inventario con stock negativo.',
          );
        }

        if (nextQuantity < inventory.reserved) {
          throw new BadRequestException(
            'El movimiento deja el inventario por debajo de lo reservado.',
          );
        }

        await tx.inventory.update({
          where: { id: inventory.id },
          data: {
            quantity: nextQuantity,
          },
        });

        const movement = await tx.inventoryMovement.create({
          data: {
            tenantId,
            variantId: createInventoryMovementDto.variantId,
            warehouseId: createInventoryMovementDto.warehouseId,
            delta: createInventoryMovementDto.delta,
            reason: this.normalizeReason(createInventoryMovementDto.reason, ''),
            referenceId: this.normalizeReferenceId(
              createInventoryMovementDto.referenceId,
            ),
            createdById: userId,
          },
          select: movementSelect,
        });

        return mapMovement(movement);
      });
    } catch (e: unknown) {
      if (e instanceof BadRequestException || e instanceof ConflictException) {
        throw e;
      }
      throw new BadRequestException('No se pudo registrar el movimiento.');
    }
  }

  async findAllMovements(
    tenantId: string,
  ): Promise<InventoryMovementResponse[]> {
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }],
      select: movementSelect,
    });

    return movements.map(mapMovement);
  }

  async findOneMovement(
    tenantId: string,
    id: string,
  ): Promise<InventoryMovementResponse> {
    const movement = await this.prisma.inventoryMovement.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: movementSelect,
    });

    if (!movement) {
      throw new NotFoundException('Movimiento de inventario no encontrado.');
    }

    return mapMovement(movement);
  }
}

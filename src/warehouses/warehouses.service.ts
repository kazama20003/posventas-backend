import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

const warehouseSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  name: true,
  code: true,
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
} satisfies Prisma.WarehouseSelect;

type WarehouseRecord = Prisma.WarehouseGetPayload<{
  select: typeof warehouseSelect;
}>;

type WarehouseResponse = {
  id: string;
  tenantId: string;
  storeId: string;
  name: string;
  code: string | null;
  createdAt: Date;
  updatedAt: Date;
  store: {
    id: string;
    name: string;
    code: string | null;
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

function mapWarehouse(warehouse: WarehouseRecord): WarehouseResponse {
  return {
    id: warehouse.id,
    tenantId: warehouse.tenantId,
    storeId: warehouse.storeId,
    name: warehouse.name,
    code: warehouse.code,
    createdAt: warehouse.createdAt,
    updatedAt: warehouse.updatedAt,
    store:
      warehouse.store && warehouse.store.deletedAt === null
        ? {
            id: warehouse.store.id,
            name: warehouse.store.name,
            code: warehouse.store.code,
          }
        : null,
  };
}

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeName(name: string): string {
    const normalized = name.trim();
    if (!normalized) {
      throw new BadRequestException('El nombre del almacen es obligatorio.');
    }
    return normalized;
  }

  private normalizeCode(code: string | undefined): string | null | undefined {
    if (code === undefined) {
      return undefined;
    }

    const normalized = code.trim().toUpperCase();
    return normalized.length > 0 ? normalized : null;
  }

  private handleUniqueError(e: Prisma.PrismaClientKnownRequestError): never {
    const targets = uniqueTargetsFromError(e);
    if (targets.includes('code') || targets.includes('storeId,code')) {
      throw new ConflictException(
        'Ya existe un almacen con ese codigo en esta tienda.',
      );
    }
    throw new ConflictException('Ya existe un almacen con datos unicos.');
  }

  private async validateStore(
    tenantId: string,
    storeId: string,
  ): Promise<string> {
    const store = await this.prisma.store.findFirst({
      where: {
        id: storeId,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!store) {
      throw new BadRequestException(
        'La tienda indicada no existe en esta empresa.',
      );
    }

    return store.id;
  }

  async create(
    tenantId: string,
    createWarehouseDto: CreateWarehouseDto,
  ): Promise<WarehouseResponse> {
    const storeId = await this.validateStore(
      tenantId,
      createWarehouseDto.storeId,
    );

    try {
      const warehouse = await this.prisma.warehouse.create({
        data: {
          tenantId,
          storeId,
          name: this.normalizeName(createWarehouseDto.name),
          code: this.normalizeCode(createWarehouseDto.code),
        },
        select: warehouseSelect,
      });

      return mapWarehouse(warehouse);
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
      throw new BadRequestException('No se pudo crear el almacen.');
    }
  }

  async findAll(tenantId: string): Promise<WarehouseResponse[]> {
    const warehouses = await this.prisma.warehouse.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }],
      select: warehouseSelect,
    });

    return warehouses.map(mapWarehouse);
  }

  async findOne(tenantId: string, id: string): Promise<WarehouseResponse> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: warehouseSelect,
    });

    if (!warehouse) {
      throw new NotFoundException('Almacen no encontrado.');
    }

    return mapWarehouse(warehouse);
  }

  async update(
    tenantId: string,
    id: string,
    updateWarehouseDto: UpdateWarehouseDto,
  ): Promise<WarehouseResponse> {
    await this.findOne(tenantId, id);

    const storeId =
      updateWarehouseDto.storeId !== undefined
        ? await this.validateStore(tenantId, updateWarehouseDto.storeId)
        : undefined;

    try {
      const warehouse = await this.prisma.warehouse.update({
        where: { id },
        data: {
          storeId,
          name:
            updateWarehouseDto.name !== undefined
              ? this.normalizeName(updateWarehouseDto.name)
              : undefined,
          code: this.normalizeCode(updateWarehouseDto.code),
        },
        select: warehouseSelect,
      });

      return mapWarehouse(warehouse);
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
      throw new BadRequestException('No se pudo actualizar el almacen.');
    }
  }

  async remove(tenantId: string, id: string): Promise<{ ok: true }> {
    await this.findOne(tenantId, id);

    const activeInventoryCount = await this.prisma.inventory.count({
      where: {
        tenantId,
        warehouseId: id,
        deletedAt: null,
        OR: [{ quantity: { gt: 0 } }, { reserved: { gt: 0 } }],
      },
    });

    if (activeInventoryCount > 0) {
      throw new BadRequestException(
        'No puedes eliminar un almacen que tiene inventario activo.',
      );
    }

    await this.prisma.warehouse.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { ok: true };
  }
}

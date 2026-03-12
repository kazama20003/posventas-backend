import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

const DEFAULT_WAREHOUSE_NAME = 'Almacen principal';
const DEFAULT_WAREHOUSE_CODE = 'MAIN';

const storeSelect = {
  id: true,
  tenantId: true,
  name: true,
  address: true,
  code: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StoreSelect;

type SafeStore = Prisma.StoreGetPayload<{ select: typeof storeSelect }>;

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

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeName(name: string): string {
    const normalized = name.trim();
    if (!normalized) {
      throw new BadRequestException('El nombre de tienda es obligatorio.');
    }
    return normalized;
  }

  private normalizeAddress(
    address: string | undefined,
  ): string | null | undefined {
    if (address === undefined) {
      return undefined;
    }
    const normalized = address.trim();
    return normalized.length > 0 ? normalized : null;
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
    if (
      targets.includes('code') ||
      targets.includes('tenantId,code') ||
      targets.includes('Store_tenantId_code_key') ||
      targets.includes('Store_tenantId_code_active_key')
    ) {
      throw new ConflictException(
        'Ya existe una tienda con ese codigo en esta empresa.',
      );
    }
    throw new ConflictException('Ya existe una tienda con datos unicos.');
  }

  async create(tenantId: string, dto: CreateStoreDto): Promise<SafeStore> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const store = await tx.store.create({
          data: {
            tenantId,
            name: this.normalizeName(dto.name),
            address: this.normalizeAddress(dto.address),
            code: this.normalizeCode(dto.code),
          },
          select: storeSelect,
        });

        await tx.warehouse.create({
          data: {
            tenantId,
            storeId: store.id,
            name: DEFAULT_WAREHOUSE_NAME,
            code: DEFAULT_WAREHOUSE_CODE,
          },
        });

        return store;
      });
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        this.handleUniqueError(e);
      }
      throw new BadRequestException('No se pudo crear la tienda.');
    }
  }

  async findAll(tenantId: string): Promise<SafeStore[]> {
    return this.prisma.store.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: storeSelect,
    });
  }

  async findOne(tenantId: string, id: string): Promise<SafeStore> {
    const store = await this.prisma.store.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: storeSelect,
    });

    if (!store) {
      throw new NotFoundException('Tienda no encontrada.');
    }

    return store;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateStoreDto,
  ): Promise<SafeStore> {
    const exists = await this.prisma.store.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Tienda no encontrada.');
    }

    try {
      return await this.prisma.store.update({
        where: { id },
        data: {
          name:
            dto.name !== undefined ? this.normalizeName(dto.name) : undefined,
          address: this.normalizeAddress(dto.address),
          code: this.normalizeCode(dto.code),
        },
        select: storeSelect,
      });
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        this.handleUniqueError(e);
      }
      throw new BadRequestException('No se pudo actualizar la tienda.');
    }
  }

  async remove(tenantId: string, id: string): Promise<{ ok: true }> {
    const exists = await this.prisma.store.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Tienda no encontrada.');
    }

    await this.prisma.store.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { ok: true };
  }
}

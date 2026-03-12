import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

const supplierSelect = {
  id: true,
  tenantId: true,
  name: true,
  contact: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SupplierSelect;

type SupplierResponse = Prisma.SupplierGetPayload<{
  select: typeof supplierSelect;
}>;

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeName(name: string): string {
    const normalized = name.trim();
    if (!normalized) {
      throw new BadRequestException('El nombre del proveedor es obligatorio.');
    }
    return normalized;
  }

  private normalizeContact(
    contact: string | undefined,
  ): string | null | undefined {
    if (contact === undefined) {
      return undefined;
    }
    const normalized = contact.trim();
    return normalized.length > 0 ? normalized : null;
  }

  async create(
    tenantId: string,
    dto: CreateSupplierDto,
  ): Promise<SupplierResponse> {
    return this.prisma.supplier.create({
      data: {
        tenantId,
        name: this.normalizeName(dto.name),
        contact: this.normalizeContact(dto.contact),
      },
      select: supplierSelect,
    });
  }

  async findAll(tenantId: string): Promise<SupplierResponse[]> {
    return this.prisma.supplier.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: [{ name: 'asc' }],
      select: supplierSelect,
    });
  }

  async findOne(tenantId: string, id: string): Promise<SupplierResponse> {
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: supplierSelect,
    });

    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado.');
    }

    return supplier;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateSupplierDto,
  ): Promise<SupplierResponse> {
    await this.findOne(tenantId, id);

    return this.prisma.supplier.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? this.normalizeName(dto.name) : undefined,
        contact: this.normalizeContact(dto.contact),
      },
      select: supplierSelect,
    });
  }

  async remove(tenantId: string, id: string): Promise<{ ok: true }> {
    await this.findOne(tenantId, id);

    await this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { ok: true };
  }
}

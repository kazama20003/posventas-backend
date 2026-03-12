import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const categorySelect = {
  id: true,
  tenantId: true,
  name: true,
  parentId: true,
  createdAt: true,
  parent: {
    select: {
      id: true,
      name: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.CategorySelect;

type CategoryRecord = Prisma.CategoryGetPayload<{
  select: typeof categorySelect;
}>;

type CategoryResponse = {
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
  parent: {
    id: string;
    name: string;
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

function mapCategory(category: CategoryRecord): CategoryResponse {
  return {
    id: category.id,
    tenantId: category.tenantId,
    name: category.name,
    parentId: category.parentId,
    createdAt: category.createdAt,
    parent:
      category.parent && category.parent.deletedAt === null
        ? {
            id: category.parent.id,
            name: category.parent.name,
          }
        : null,
  };
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeName(name: string): string {
    const normalized = name.trim();
    if (!normalized) {
      throw new BadRequestException('El nombre de categoria es obligatorio.');
    }
    return normalized;
  }

  private handleUniqueError(e: Prisma.PrismaClientKnownRequestError): never {
    const targets = uniqueTargetsFromError(e);
    if (targets.includes('name') || targets.includes('tenantId,name')) {
      throw new ConflictException(
        'Ya existe una categoria con ese nombre en esta empresa.',
      );
    }
    throw new ConflictException('Ya existe una categoria con datos unicos.');
  }

  private async ensureCategoryExists(
    tenantId: string,
    categoryId: string,
  ): Promise<{ id: string; parentId: string | null }> {
    const category = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        parentId: true,
      },
    });

    if (!category) {
      throw new NotFoundException('Categoria no encontrada.');
    }

    return category;
  }

  private async validateParentCategory(
    tenantId: string,
    categoryId: string | null,
    currentCategoryId?: string,
  ): Promise<string | null | undefined> {
    if (categoryId === undefined) {
      return undefined;
    }

    if (categoryId === null) {
      return null;
    }

    if (currentCategoryId && currentCategoryId === categoryId) {
      throw new BadRequestException(
        'Una categoria no puede ser su propia categoria padre.',
      );
    }

    const parent = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        parentId: true,
      },
    });

    if (!parent) {
      throw new BadRequestException(
        'La categoria padre no existe en esta empresa.',
      );
    }

    if (currentCategoryId) {
      let cursor: string | null = parent.id;

      while (cursor) {
        if (cursor === currentCategoryId) {
          throw new BadRequestException(
            'No puedes mover una categoria dentro de una de sus hijas.',
          );
        }

        const current: { parentId: string | null } | null =
          await this.prisma.category.findUnique({
            where: { id: cursor },
            select: { parentId: true },
          });

        cursor = current?.parentId ?? null;
      }
    }

    return parent.id;
  }

  async create(
    tenantId: string,
    dto: CreateCategoryDto,
  ): Promise<CategoryResponse> {
    const parentId = await this.validateParentCategory(
      tenantId,
      dto.parentId ?? null,
    );

    try {
      const category = await this.prisma.category.create({
        data: {
          tenantId,
          name: this.normalizeName(dto.name),
          parentId: parentId ?? null,
        },
        select: categorySelect,
      });

      return mapCategory(category);
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        this.handleUniqueError(e);
      }
      throw new BadRequestException('No se pudo crear la categoria.');
    }
  }

  async findAll(tenantId: string): Promise<CategoryResponse[]> {
    const categories = await this.prisma.category.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: [{ name: 'asc' }],
      select: categorySelect,
    });

    return categories.map(mapCategory);
  }

  async findOne(tenantId: string, id: string): Promise<CategoryResponse> {
    const category = await this.prisma.category.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: categorySelect,
    });

    if (!category) {
      throw new NotFoundException('Categoria no encontrada.');
    }

    return mapCategory(category);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryResponse> {
    await this.ensureCategoryExists(tenantId, id);

    const parentId =
      dto.parentId !== undefined
        ? await this.validateParentCategory(tenantId, dto.parentId, id)
        : undefined;

    try {
      const category = await this.prisma.category.update({
        where: { id },
        data: {
          name:
            dto.name !== undefined ? this.normalizeName(dto.name) : undefined,
          parentId,
        },
        select: categorySelect,
      });

      return mapCategory(category);
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        this.handleUniqueError(e);
      }
      throw new BadRequestException('No se pudo actualizar la categoria.');
    }
  }

  async remove(tenantId: string, id: string): Promise<{ ok: true }> {
    await this.ensureCategoryExists(tenantId, id);

    const [childrenCount, productsCount] = await Promise.all([
      this.prisma.category.count({
        where: {
          tenantId,
          parentId: id,
          deletedAt: null,
        },
      }),
      this.prisma.product.count({
        where: {
          tenantId,
          categoryId: id,
          deletedAt: null,
        },
      }),
    ]);

    if (childrenCount > 0) {
      throw new BadRequestException(
        'No puedes eliminar una categoria que tiene subcategorias activas.',
      );
    }

    if (productsCount > 0) {
      throw new BadRequestException(
        'No puedes eliminar una categoria que tiene productos activos.',
      );
    }

    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { ok: true };
  }
}

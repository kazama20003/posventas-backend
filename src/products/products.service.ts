import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProductDto,
  ProductImageDto,
  ProductTypeValue,
  ProductVariantDto,
  UnitOfMeasureValue,
} from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const productSelect = {
  id: true,
  tenantId: true,
  name: true,
  description: true,
  categoryId: true,
  images: true,
  salePrice: true,
  isActive: true,
  brand: true,
  trackStock: true,
  taxRate: true,
  minStock: true,
  productType: true,
  visibleInPos: true,
  createdAt: true,
  updatedAt: true,
  variants: {
    where: {
      deletedAt: null,
    },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      sku: true,
      barcode: true,
      unitOfMeasure: true,
      attributes: true,
      cost: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  category: {
    select: {
      id: true,
      name: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.ProductSelect;

type ProductRecord = Prisma.ProductGetPayload<{
  select: typeof productSelect;
}>;

type ProductImage = {
  key: string;
  url: string;
};

type ProductVariantAttributeValue = string | number | boolean | null;
type ProductVariantAttributes = Record<string, ProductVariantAttributeValue>;

type ProductVariantResponse = {
  id: string;
  sku: string;
  barcode: string | null;
  unitOfMeasure: UnitOfMeasureValue;
  attributes: ProductVariantAttributes | null;
  cost: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProductResponse = {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  images: ProductImage[];
  salePrice: number;
  isActive: boolean;
  brand: string | null;
  trackStock: boolean;
  taxRate: number;
  minStock: number;
  productType: ProductTypeValue;
  visibleInPos: boolean;
  variants: ProductVariantResponse[];
  createdAt: Date;
  updatedAt: Date;
  category: {
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

function isProductImage(value: unknown): value is ProductImage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as { key?: unknown; url?: unknown };
  return typeof candidate.key === 'string' && typeof candidate.url === 'string';
}

function parseProductImages(value: Prisma.JsonValue | null): ProductImage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isProductImage).map(({ key, url }) => ({ key, url }));
}

function isVariantAttributeValue(
  value: unknown,
): value is ProductVariantAttributeValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function parseVariantAttributes(
  value: Prisma.JsonValue | null,
): ProductVariantAttributes | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const entries = Object.entries(value).filter(([, entryValue]) =>
    isVariantAttributeValue(entryValue),
  );

  return Object.fromEntries(entries) as ProductVariantAttributes;
}

function mapProduct(product: ProductRecord): ProductResponse {
  return {
    id: product.id,
    tenantId: product.tenantId,
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    images: parseProductImages(product.images),
    salePrice: product.salePrice.toNumber(),
    isActive: product.isActive,
    brand: product.brand,
    trackStock: product.trackStock,
    taxRate: product.taxRate.toNumber(),
    minStock: product.minStock,
    productType: product.productType as ProductTypeValue,
    visibleInPos: product.visibleInPos,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      barcode: variant.barcode,
      unitOfMeasure: variant.unitOfMeasure as UnitOfMeasureValue,
      attributes: parseVariantAttributes(variant.attributes),
      cost: variant.cost?.toNumber() ?? null,
      createdAt: variant.createdAt,
      updatedAt: variant.updatedAt,
    })),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    category:
      product.category && product.category.deletedAt === null
        ? {
            id: product.category.id,
            name: product.category.name,
          }
        : null,
  };
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeName(name: string): string {
    const normalized = name.trim();
    if (!normalized) {
      throw new BadRequestException('El nombre del producto es obligatorio.');
    }
    return normalized;
  }

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

  private normalizeTaxRate(
    value: number | undefined,
  ): Prisma.Decimal | undefined {
    const normalized = this.normalizeMoney(value, 'El impuesto');
    if (normalized === undefined) {
      return undefined;
    }
    if (normalized.greaterThan(100)) {
      throw new BadRequestException('El impuesto no puede ser mayor a 100.');
    }
    return normalized;
  }

  private normalizeImages(
    images: ProductImageDto[] | undefined,
  ): Prisma.InputJsonValue | undefined {
    if (images === undefined) {
      return undefined;
    }

    return images.map((image) => ({
      key: image.key.trim(),
      url: image.url.trim(),
    }));
  }

  private normalizeVariantSku(sku: string): string {
    const normalized = sku.trim();
    if (!normalized) {
      throw new BadRequestException('El SKU de la variante es obligatorio.');
    }
    return normalized;
  }

  private normalizeVariantAttributes(
    attributes:
      | Record<string, string | number | boolean | null>
      | null
      | undefined,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (attributes === undefined) {
      return undefined;
    }

    if (attributes === null) {
      return Prisma.JsonNull;
    }

    const normalizedEntries = Object.entries(attributes).map(([key, value]) => {
      const normalizedKey = key.trim();
      if (!normalizedKey) {
        throw new BadRequestException(
          'Los atributos de la variante deben tener claves validas.',
        );
      }

      if (!isVariantAttributeValue(value)) {
        throw new BadRequestException(
          'Los atributos de la variante solo aceptan texto, numero, booleano o null.',
        );
      }

      return [
        normalizedKey,
        typeof value === 'string' ? value.trim() : value,
      ] as const;
    });

    return Object.fromEntries(normalizedEntries);
  }

  private buildVariantCreateData(
    tenantId: string,
    variant: ProductVariantDto,
  ): Omit<Prisma.ProductVariantUncheckedCreateInput, 'productId'> {
    return {
      tenantId,
      sku: this.normalizeVariantSku(variant.sku),
      barcode: this.normalizeOptionalString(variant.barcode),
      unitOfMeasure: variant.unitOfMeasure ?? 'UNIT',
      attributes: this.normalizeVariantAttributes(variant.attributes),
      cost:
        variant.cost === null
          ? null
          : this.normalizeMoney(variant.cost, 'El costo de la variante'),
    };
  }

  private validateVariantPayload(variants: ProductVariantDto[]): void {
    const skuSet = new Set<string>();
    const idSet = new Set<string>();

    for (const variant of variants) {
      const normalizedSku = this.normalizeVariantSku(variant.sku);
      if (skuSet.has(normalizedSku)) {
        throw new BadRequestException(
          'No se permiten SKUs repetidos en las variantes del producto.',
        );
      }
      skuSet.add(normalizedSku);

      if (variant.id) {
        if (idSet.has(variant.id)) {
          throw new BadRequestException(
            'No se permiten IDs repetidos en las variantes del producto.',
          );
        }
        idSet.add(variant.id);
      }
    }
  }

  private async syncVariants(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    variants: ProductVariantDto[],
  ): Promise<void> {
    this.validateVariantPayload(variants);

    const existingVariants = await tx.productVariant.findMany({
      where: {
        tenantId,
        productId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    const existingVariantIds = new Set(
      existingVariants.map((variant) => variant.id),
    );
    const retainedVariantIds = new Set<string>();

    for (const variant of variants) {
      const variantData = this.buildVariantCreateData(tenantId, variant);

      if (variant.id) {
        if (!existingVariantIds.has(variant.id)) {
          throw new BadRequestException(
            'La variante indicada no existe en este producto.',
          );
        }

        await tx.productVariant.update({
          where: {
            id: variant.id,
          },
          data: {
            sku: variantData.sku,
            barcode: variantData.barcode,
            unitOfMeasure: variantData.unitOfMeasure,
            attributes: variantData.attributes,
            cost: variantData.cost,
          },
        });
        retainedVariantIds.add(variant.id);
        continue;
      }

      const createdVariant = await tx.productVariant.create({
        data: {
          ...variantData,
          productId,
        },
        select: {
          id: true,
        },
      });

      retainedVariantIds.add(createdVariant.id);
    }

    const variantIdsToDelete = existingVariants
      .map((variant) => variant.id)
      .filter((variantId) => !retainedVariantIds.has(variantId));

    if (variantIdsToDelete.length > 0) {
      await tx.productVariant.updateMany({
        where: {
          tenantId,
          productId,
          id: {
            in: variantIdsToDelete,
          },
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });
    }
  }

  private handleUniqueError(e: Prisma.PrismaClientKnownRequestError): never {
    const targets = uniqueTargetsFromError(e);
    if (targets.includes('name') || targets.includes('tenantId,name')) {
      throw new ConflictException(
        'Ya existe un producto con ese nombre en esta empresa.',
      );
    }
    if (targets.includes('sku') || targets.includes('tenantId,sku')) {
      throw new ConflictException(
        'Ya existe una variante con ese SKU en esta empresa.',
      );
    }
    throw new ConflictException('Ya existe un producto con datos unicos.');
  }

  private async validateCategory(
    tenantId: string,
    categoryId: string | null,
  ): Promise<string | null> {
    if (categoryId === null) {
      return null;
    }

    const category = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException(
        'La categoria indicada no existe en esta empresa.',
      );
    }

    return category.id;
  }

  async create(
    tenantId: string,
    dto: CreateProductDto,
  ): Promise<ProductResponse> {
    const categoryId = await this.validateCategory(
      tenantId,
      dto.categoryId ?? null,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const createdProduct = await tx.product.create({
          data: {
            tenantId,
            name: this.normalizeName(dto.name),
            description: this.normalizeOptionalString(dto.description),
            categoryId,
            images: this.normalizeImages(dto.images) ?? [],
            salePrice: this.normalizeMoney(dto.salePrice, 'El precio de venta'),
            isActive: dto.isActive ?? true,
            brand: this.normalizeOptionalString(dto.brand),
            trackStock: dto.trackStock ?? true,
            taxRate: this.normalizeTaxRate(dto.taxRate),
            minStock: dto.minStock ?? 0,
            productType: dto.productType ?? 'PHYSICAL',
            visibleInPos: dto.visibleInPos ?? true,
          },
          select: {
            id: true,
          },
        });

        if (dto.variants !== undefined) {
          await this.syncVariants(
            tx,
            tenantId,
            createdProduct.id,
            dto.variants,
          );
        }

        const product = await tx.product.findUniqueOrThrow({
          where: {
            id: createdProduct.id,
          },
          select: productSelect,
        });

        return mapProduct(product);
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
      throw new BadRequestException('No se pudo crear el producto.');
    }
  }

  async findAll(tenantId: string): Promise<ProductResponse[]> {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: [{ name: 'asc' }],
      select: productSelect,
    });

    return products.map(mapProduct);
  }

  async findOne(tenantId: string, id: string): Promise<ProductResponse> {
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: productSelect,
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado.');
    }

    return mapProduct(product);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<ProductResponse> {
    await this.findOne(tenantId, id);

    const categoryId =
      dto.categoryId !== undefined
        ? await this.validateCategory(tenantId, dto.categoryId)
        : undefined;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.product.update({
          where: { id },
          data: {
            name:
              dto.name !== undefined ? this.normalizeName(dto.name) : undefined,
            description: this.normalizeOptionalString(dto.description),
            categoryId,
            images: this.normalizeImages(dto.images),
            salePrice: this.normalizeMoney(dto.salePrice, 'El precio de venta'),
            isActive: dto.isActive,
            brand: this.normalizeOptionalString(dto.brand),
            trackStock: dto.trackStock,
            taxRate: this.normalizeTaxRate(dto.taxRate),
            minStock: dto.minStock,
            productType: dto.productType,
            visibleInPos: dto.visibleInPos,
          },
        });

        if (dto.variants !== undefined) {
          await this.syncVariants(tx, tenantId, id, dto.variants);
        }

        const product = await tx.product.findUniqueOrThrow({
          where: { id },
          select: productSelect,
        });

        return mapProduct(product);
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
      throw new BadRequestException('No se pudo actualizar el producto.');
    }
  }

  async remove(tenantId: string, id: string): Promise<{ ok: true }> {
    await this.findOne(tenantId, id);

    const activeVariantsCount = await this.prisma.productVariant.count({
      where: {
        tenantId,
        productId: id,
        deletedAt: null,
      },
    });

    if (activeVariantsCount > 0) {
      throw new BadRequestException(
        'No puedes eliminar un producto que tiene variantes activas.',
      );
    }

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { ok: true };
  }
}

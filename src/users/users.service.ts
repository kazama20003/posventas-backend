import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../auth/utils/password.util';
import {
  CreateUserDto,
  USER_ROLE_VALUES,
  UserRoleValue,
} from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const DEFAULT_USER_ROLE: UserRoleValue = 'SELLER';

const userWithAccessSelect = {
  id: true,
  tenantId: true,
  email: true,
  displayName: true,
  ruc: true,
  phone: true,
  avatarUrl: true,
  emailVerifiedAt: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    select: {
      role: {
        select: {
          id: true,
          name: true,
          deletedAt: true,
        },
      },
    },
  },
  stores: {
    where: { deletedAt: null },
    select: {
      store: {
        select: {
          id: true,
          name: true,
          code: true,
          address: true,
          deletedAt: true,
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

type UserWithAccess = Prisma.UserGetPayload<{
  select: typeof userWithAccessSelect;
}>;

type UserResponse = {
  id: string;
  tenantId: string;
  email: string;
  displayName: string | null;
  ruc: string | null;
  phone: string | null;
  avatarUrl: string | null;
  emailVerifiedAt: Date | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: Array<{
    id: string;
    name: string;
  }>;
  stores: Array<{
    id: string;
    name: string;
    code: string | null;
    address: string | null;
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

function mapUserWithAccess(user: UserWithAccess): UserResponse {
  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    displayName: user.displayName,
    ruc: user.ruc,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    emailVerifiedAt: user.emailVerifiedAt,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles: user.roles
      .map(({ role }) => role)
      .filter(
        (
          role,
        ): role is {
          id: string;
          name: string;
          deletedAt: Date | null;
        } => role !== null && role.deletedAt === null,
      )
      .map(({ id, name }) => ({ id, name })),
    stores: user.stores
      .map(({ store }) => store)
      .filter(
        (
          store,
        ): store is {
          id: string;
          name: string;
          code: string | null;
          address: string | null;
          deletedAt: Date | null;
        } => store !== null && store.deletedAt === null,
      )
      .map(({ id, name, code, address }) => ({ id, name, code, address })),
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeEmail(email: string): string {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('El email es obligatorio.');
    }
    return normalized;
  }

  private normalizeOptionalString(
    value: string | undefined,
  ): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeRole(role: UserRoleValue | undefined): UserRoleValue {
    const normalized = role ?? DEFAULT_USER_ROLE;
    if (!USER_ROLE_VALUES.includes(normalized)) {
      throw new BadRequestException('Rol de usuario invalido.');
    }
    return normalized;
  }

  private normalizeStoreIds(
    storeIds: string[] | undefined,
  ): string[] | undefined {
    if (storeIds === undefined) {
      return undefined;
    }
    return [...new Set(storeIds)];
  }

  private handleUniqueError(e: Prisma.PrismaClientKnownRequestError): never {
    const targets = uniqueTargetsFromError(e);

    if (targets.includes('email') || targets.includes('tenantId,email')) {
      throw new ConflictException(
        'Ya existe un usuario con ese email en esta empresa.',
      );
    }
    if (targets.includes('ruc') || targets.includes('tenantId,ruc')) {
      throw new ConflictException('Ya existe un usuario con ese RUC.');
    }

    throw new ConflictException(
      'Ya existe un usuario con datos unicos repetidos.',
    );
  }

  private async ensureTenantRoleTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    roleName: UserRoleValue,
  ): Promise<{ id: string }> {
    const existingRole = await tx.role.findFirst({
      where: { tenantId, name: roleName },
      select: { id: true, deletedAt: true },
    });

    if (existingRole) {
      if (existingRole.deletedAt !== null) {
        await tx.role.update({
          where: { id: existingRole.id },
          data: { deletedAt: null },
        });
      }
      return { id: existingRole.id };
    }

    try {
      return await tx.role.create({
        data: { tenantId, name: roleName },
        select: { id: true },
      });
    } catch (e: unknown) {
      if (
        !(e instanceof Prisma.PrismaClientKnownRequestError) ||
        e.code !== 'P2002'
      ) {
        throw e;
      }

      const conflictedRole = await tx.role.findFirst({
        where: { tenantId, name: roleName },
        select: { id: true, deletedAt: true },
      });

      if (!conflictedRole) {
        throw e;
      }

      if (conflictedRole.deletedAt !== null) {
        await tx.role.update({
          where: { id: conflictedRole.id },
          data: { deletedAt: null },
        });
      }

      return { id: conflictedRole.id };
    }
  }

  private async assignSingleUserRoleTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    roleName: UserRoleValue,
  ): Promise<void> {
    const role = await this.ensureTenantRoleTx(tx, tenantId, roleName);

    await tx.userRole.deleteMany({
      where: { userId },
    });

    await tx.userRole.create({
      data: {
        userId,
        roleId: role.id,
      },
    });
  }

  private async ensureStoresBelongToTenantTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    storeIds: string[],
  ): Promise<void> {
    if (storeIds.length === 0) {
      return;
    }

    const count = await tx.store.count({
      where: {
        tenantId,
        deletedAt: null,
        id: { in: storeIds },
      },
    });

    if (count !== storeIds.length) {
      throw new BadRequestException(
        'Una o mas tiendas no existen en esta empresa.',
      );
    }
  }

  private async syncUserStoresTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    storeIds: string[],
  ): Promise<void> {
    await this.ensureStoresBelongToTenantTx(tx, tenantId, storeIds);

    await tx.userStore.updateMany({
      where: { userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    for (const storeId of storeIds) {
      await tx.userStore.upsert({
        where: {
          userId_storeId: {
            userId,
            storeId,
          },
        },
        update: {
          deletedAt: null,
        },
        create: {
          userId,
          storeId,
        },
      });
    }
  }

  async findTenantBySlug(
    slug: string,
  ): Promise<{ id: string; slug: string; name: string }> {
    const normalizedSlug = slug.trim().toLowerCase();
    if (!normalizedSlug) {
      throw new BadRequestException('Slug de empresa invalido.');
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: {
        slug: normalizedSlug,
        deletedAt: null,
      },
      select: {
        id: true,
        slug: true,
        name: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Empresa no encontrada.');
    }

    return tenant;
  }

  async create(tenantId: string, dto: CreateUserDto): Promise<UserResponse> {
    const email = this.normalizeEmail(dto.email);
    const password = await hashPassword(dto.password);
    const role = this.normalizeRole(dto.role);
    const storeIds = this.normalizeStoreIds(dto.storeIds) ?? [];

    try {
      const userId = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            tenantId,
            email,
            password,
            displayName: this.normalizeOptionalString(dto.displayName),
            ruc: this.normalizeOptionalString(dto.ruc),
            phone: this.normalizeOptionalString(dto.phone),
            isActive: dto.isActive ?? true,
          },
          select: { id: true },
        });

        await this.assignSingleUserRoleTx(tx, tenantId, user.id, role);
        await this.syncUserStoresTx(tx, tenantId, user.id, storeIds);

        return user.id;
      });

      return this.findOne(tenantId, userId);
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        this.handleUniqueError(e);
      }
      throw e;
    }
  }

  async findAll(tenantId: string): Promise<UserResponse[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: userWithAccessSelect,
    });

    return users.map(mapUserWithAccess);
  }

  async findOne(tenantId: string, id: string): Promise<UserResponse> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: userWithAccessSelect,
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    return mapUserWithAccess(user);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateUserDto,
  ): Promise<UserResponse> {
    const exists = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const role = dto.role ? this.normalizeRole(dto.role) : undefined;
    const storeIds = this.normalizeStoreIds(dto.storeIds);
    const password = dto.password
      ? await hashPassword(dto.password)
      : undefined;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id },
          data: {
            email: dto.email ? this.normalizeEmail(dto.email) : undefined,
            password,
            displayName: this.normalizeOptionalString(dto.displayName),
            ruc: this.normalizeOptionalString(dto.ruc),
            phone: this.normalizeOptionalString(dto.phone),
            isActive: dto.isActive,
          },
          select: { id: true },
        });

        if (role) {
          await this.assignSingleUserRoleTx(tx, tenantId, id, role);
        }

        if (storeIds !== undefined) {
          await this.syncUserStoresTx(tx, tenantId, id, storeIds);
        }
      });

      return this.findOne(tenantId, id);
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        this.handleUniqueError(e);
      }
      throw e;
    }
  }

  async remove(tenantId: string, id: string): Promise<{ ok: true }> {
    const exists = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });

      await tx.userStore.updateMany({
        where: { userId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });

    return { ok: true };
  }
}

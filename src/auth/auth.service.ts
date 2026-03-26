import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma, Tenant, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthJwtPayload } from './types/auth-jwt-payload.type';
import { hashPassword, verifyPassword } from './utils/password.util';

type SafeUser = Omit<User, 'password'>;
type SafeTenant = Pick<Tenant, 'id' | 'name' | 'slug'>;

export type AuthResult = {
  token: string;
  user: SafeUser;
  tenant: SafeTenant;
};

export type AuthMeResult = SafeUser & {
  tenantSlug: string;
  roles: Array<{
    id: string;
    name: string;
  }>;
};

export type GoogleLoginInput = {
  tenantSlug?: string;
  businessName?: string;
  providerAccountId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  accessToken?: string;
  refreshToken?: string;
};

const DEFAULT_STORE_NAME = 'Sucursal principal';
const DEFAULT_STORE_CODE = 'MAIN';
const DEFAULT_WAREHOUSE_NAME = 'Almacen principal';
const DEFAULT_WAREHOUSE_CODE = 'MAIN';

function toSafeUser<T extends User>(user: T): Omit<T, 'password'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...safe } = user;
  return safe;
}

function toSafeTenant(tenant: Tenant): SafeTenant {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
  };
}

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

function isUniqueViolation(
  e: unknown,
): e is Prisma.PrismaClientKnownRequestError {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
  );
}

@Injectable()
export class AuthService {
  private static readonly FREE_TRIAL_DAYS = 5;
  private static readonly OWNER_ROLE_NAME = 'OWNER';
  private static readonly TRIAL_PLAN = 'PRO';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeTenantSlug(slug: string): string {
    const normalized = slug.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('Tenant slug invalido.');
    }
    return normalized;
  }

  private slugifyTenantName(name: string): string {
    const base = name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');

    if (!base) {
      throw new BadRequestException(
        'No se pudo generar un slug valido para la empresa.',
      );
    }

    return base.slice(0, 50);
  }

  private randomSlugSuffix(): string {
    return Math.random().toString(36).slice(2, 8);
  }

  private buildInitialSubscriptionData(startAt: Date = new Date()): {
    plan: 'PRO';
    status: 'TRIALING';
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    trialEndsAt: Date;
  } {
    const trialEndsAt = new Date(
      startAt.getTime() + AuthService.FREE_TRIAL_DAYS * 24 * 60 * 60 * 1000,
    );

    return {
      plan: AuthService.TRIAL_PLAN,
      status: 'TRIALING',
      currentPeriodStart: startAt,
      currentPeriodEnd: trialEndsAt,
      trialEndsAt,
    };
  }

  private deriveBusinessNameForGoogle(input: GoogleLoginInput): string {
    const fromInput = input.businessName?.trim();
    if (fromInput) {
      return fromInput;
    }

    const fromDisplayName = input.displayName?.trim();
    if (fromDisplayName) {
      return fromDisplayName;
    }

    const localPart = this.normalizeEmail(input.email).split('@')[0]?.trim();
    if (localPart) {
      return localPart.replace(/[-_.]+/g, ' ');
    }

    return 'Mi empresa';
  }

  private async createTenantWithTrialPlanTx(
    tx: Prisma.TransactionClient,
    businessName: string,
    preferredSlug: string,
    allowSlugSuffix: boolean,
  ): Promise<Tenant> {
    const baseSlug = this.normalizeTenantSlug(preferredSlug);
    const attempts = allowSlugSuffix ? 10 : 1;

    for (let i = 0; i < attempts; i += 1) {
      const slug =
        i === 0 ? baseSlug : `${baseSlug}-${this.randomSlugSuffix()}`;

      try {
        const tenant = await tx.tenant.create({
          data: {
            name: businessName.trim(),
            slug,
          },
        });

        const trialStartAt = new Date();

        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            ...this.buildInitialSubscriptionData(trialStartAt),
          },
        });

        return tenant;
      } catch (e: unknown) {
        if (!isUniqueViolation(e)) {
          throw e;
        }

        if (!allowSlugSuffix) {
          const existing = await tx.tenant.findFirst({
            where: { slug, deletedAt: null },
          });
          if (existing) {
            return existing;
          }
        }
      }
    }

    throw new ConflictException(
      'No se pudo crear una empresa con un slug disponible.',
    );
  }

  private signToken(
    user: Pick<User, 'id' | 'tenantId' | 'email'>,
    tenantSlug: string,
  ): string {
    return this.jwtService.sign({
      sub: user.id,
      tenantId: user.tenantId,
      tenantSlug,
      email: user.email,
    });
  }

  private async getTenantBySlugOrFail(slug: string): Promise<Tenant> {
    const normalizedSlug = this.normalizeTenantSlug(slug);
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        slug: normalizedSlug,
        deletedAt: null,
      },
    });

    if (!tenant) {
      throw new UnauthorizedException('Empresa no encontrada.');
    }

    return tenant;
  }

  private async ensureLocalAuthAccount(user: User): Promise<void> {
    const account = await this.prisma.authAccount.findFirst({
      where: {
        tenantId: user.tenantId,
        userId: user.id,
        provider: 'LOCAL',
        deletedAt: null,
      },
      select: { id: true },
    });

    if (account) {
      return;
    }

    try {
      await this.prisma.authAccount.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          provider: 'LOCAL',
          providerAccountId: user.email,
        },
      });
    } catch (e: unknown) {
      if (isUniqueViolation(e)) {
        return;
      }
      throw e;
    }
  }

  private async ensureTenantRoleTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    roleName: string,
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
      if (!isUniqueViolation(e)) {
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

  private async assignRoleToUserTx(
    tx: Prisma.TransactionClient,
    userId: string,
    roleId: string,
  ): Promise<void> {
    try {
      await tx.userRole.create({
        data: { userId, roleId },
      });
    } catch (e: unknown) {
      if (isUniqueViolation(e)) {
        return;
      }
      throw e;
    }
  }

  private async assignOwnerRoleToUserTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const ownerRole = await this.ensureTenantRoleTx(
      tx,
      tenantId,
      AuthService.OWNER_ROLE_NAME,
    );
    await this.assignRoleToUserTx(tx, userId, ownerRole.id);
  }

  private async ensurePrimaryStoreTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<{ id: string }> {
    const activeStore = await tx.store.findFirst({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'asc' }],
      select: { id: true },
    });

    if (activeStore) {
      return activeStore;
    }

    const mainStore = await tx.store.findFirst({
      where: {
        tenantId,
        code: DEFAULT_STORE_CODE,
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    if (mainStore) {
      await tx.store.update({
        where: { id: mainStore.id },
        data: {
          name: DEFAULT_STORE_NAME,
          code: DEFAULT_STORE_CODE,
          deletedAt: null,
        },
      });

      return { id: mainStore.id };
    }

    return tx.store.create({
      data: {
        tenantId,
        name: DEFAULT_STORE_NAME,
        code: DEFAULT_STORE_CODE,
      },
      select: { id: true },
    });
  }

  private async ensurePrimaryWarehouseTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    storeId: string,
  ): Promise<void> {
    const mainWarehouse = await tx.warehouse.findFirst({
      where: {
        storeId,
        code: DEFAULT_WAREHOUSE_CODE,
      },
      select: {
        id: true,
        deletedAt: true,
      },
    });

    if (mainWarehouse) {
      if (mainWarehouse.deletedAt !== null) {
        await tx.warehouse.update({
          where: { id: mainWarehouse.id },
          data: {
            name: DEFAULT_WAREHOUSE_NAME,
            deletedAt: null,
          },
        });
      }
      return;
    }

    await tx.warehouse.create({
      data: {
        tenantId,
        storeId,
        name: DEFAULT_WAREHOUSE_NAME,
        code: DEFAULT_WAREHOUSE_CODE,
      },
    });
  }

  private async ensureUserStoreAccessTx(
    tx: Prisma.TransactionClient,
    userId: string,
    storeId: string,
  ): Promise<void> {
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

  private async provisionInitialTenantResourcesTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const store = await this.ensurePrimaryStoreTx(tx, tenantId);
    await this.ensurePrimaryWarehouseTx(tx, tenantId, store.id);
    await this.ensureUserStoreAccessTx(tx, userId, store.id);
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    const businessName = dto.businessName.trim();
    if (!businessName) {
      throw new BadRequestException('El nombre de empresa es obligatorio.');
    }

    const normalizedTenantSlug = dto.tenantSlug
      ? this.normalizeTenantSlug(dto.tenantSlug)
      : this.slugifyTenantName(businessName);
    const normalizedEmail = this.normalizeEmail(dto.email);

    const password = await hashPassword(dto.password);

    try {
      const { tenant, user } = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: businessName,
            slug: normalizedTenantSlug,
          },
        });

        const trialStartAt = new Date();

        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            ...this.buildInitialSubscriptionData(trialStartAt),
          },
        });

        const created = await tx.user.create({
          data: {
            tenantId: tenant.id,
            email: normalizedEmail,
            password,
            displayName: dto.displayName?.trim(),
            isActive: true,
          },
        });

        await tx.authAccount.create({
          data: {
            tenantId: tenant.id,
            userId: created.id,
            provider: 'LOCAL',
            providerAccountId: normalizedEmail,
          },
        });

        await this.assignOwnerRoleToUserTx(tx, tenant.id, created.id);
        await this.provisionInitialTenantResourcesTx(tx, tenant.id, created.id);

        return { tenant, user: created };
      });

      return {
        token: this.signToken(user, tenant.slug),
        user: toSafeUser(user),
        tenant: toSafeTenant(tenant),
      };
    } catch (e: unknown) {
      if (isUniqueViolation(e)) {
        const targets = uniqueTargetsFromError(e);
        if (targets.includes('slug')) {
          throw new ConflictException(
            'Ese slug de empresa ya existe. Prueba con otro.',
          );
        }
        if (targets.includes('email') || targets.includes('tenantId,email')) {
          throw new ConflictException(
            'Ya existe un usuario owner con ese email en esta empresa.',
          );
        }
      }
      throw new BadRequestException(
        'No se pudo registrar la empresa y el usuario.',
      );
    }
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const tenant = await this.getTenantBySlugOrFail(dto.tenantSlug);
    const normalizedEmail = this.normalizeEmail(dto.email);

    const user = await this.prisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        email: normalizedEmail,
        deletedAt: null,
      },
    });

    if (!user || !user.password || !user.isActive) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    const isValidPassword = await verifyPassword(dto.password, user.password);

    if (!isValidPassword) {
      throw new UnauthorizedException('Credenciales invalidas.');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.ensureLocalAuthAccount(updatedUser);

    return {
      token: this.signToken(updatedUser, tenant.slug),
      user: toSafeUser(updatedUser),
      tenant: toSafeTenant(tenant),
    };
  }

  async loginWithGoogle(input: GoogleLoginInput): Promise<AuthResult> {
    const email = this.normalizeEmail(input.email);
    const now = new Date();

    try {
      const { tenant, user } = await this.prisma.$transaction(async (tx) => {
        const globalAccount = await tx.authAccount.findFirst({
          where: {
            deletedAt: null,
            provider: 'GOOGLE',
            providerAccountId: input.providerAccountId,
          },
          select: { id: true, userId: true, tenantId: true },
        });

        if (globalAccount) {
          const tenant = await tx.tenant.findFirst({
            where: {
              id: globalAccount.tenantId,
              deletedAt: null,
            },
          });
          if (!tenant) {
            throw new UnauthorizedException('Empresa no encontrada.');
          }

          await tx.authAccount.update({
            where: { id: globalAccount.id },
            data: {
              accessToken: input.accessToken,
              refreshToken: input.refreshToken,
              deletedAt: null,
            },
          });

          const user = await tx.user.update({
            where: { id: globalAccount.userId },
            data: {
              isActive: true,
              emailVerifiedAt: now,
              displayName: input.displayName?.trim() || undefined,
              avatarUrl: input.avatarUrl?.trim() || undefined,
              lastLoginAt: now,
            },
          });

          return { tenant, user };
        }

        let tenant: Tenant;
        let tenantWasCreated = false;

        if (input.tenantSlug) {
          const normalizedSlug = this.normalizeTenantSlug(input.tenantSlug);
          const existingTenant = await tx.tenant.findFirst({
            where: {
              slug: normalizedSlug,
              deletedAt: null,
            },
          });

          if (existingTenant) {
            tenant = existingTenant;
          } else {
            tenant = await this.createTenantWithTrialPlanTx(
              tx,
              this.deriveBusinessNameForGoogle(input),
              normalizedSlug,
              false,
            );
            tenantWasCreated = true;
          }
        } else {
          const businessName = this.deriveBusinessNameForGoogle(input);
          const generatedSlug = this.slugifyTenantName(businessName);
          tenant = await this.createTenantWithTrialPlanTx(
            tx,
            businessName,
            generatedSlug,
            true,
          );
          tenantWasCreated = true;
        }

        const tenantId = tenant.id;

        const existingUser = await tx.user.findFirst({
          where: { tenantId, email, deletedAt: null },
          select: { id: true },
        });

        if (existingUser) {
          await tx.authAccount.create({
            data: {
              tenantId,
              userId: existingUser.id,
              provider: 'GOOGLE',
              providerAccountId: input.providerAccountId,
              accessToken: input.accessToken,
              refreshToken: input.refreshToken,
            },
          });

          const user = await tx.user.update({
            where: { id: existingUser.id },
            data: {
              isActive: true,
              emailVerifiedAt: now,
              displayName: input.displayName?.trim() || undefined,
              avatarUrl: input.avatarUrl?.trim() || undefined,
              lastLoginAt: now,
            },
          });

          if (tenantWasCreated) {
            await this.assignOwnerRoleToUserTx(tx, tenantId, existingUser.id);
            await this.provisionInitialTenantResourcesTx(
              tx,
              tenantId,
              existingUser.id,
            );
          }

          return { tenant, user };
        }

        const createdUser = await tx.user.create({
          data: {
            tenantId,
            email,
            password: null,
            displayName: input.displayName?.trim(),
            avatarUrl: input.avatarUrl?.trim(),
            emailVerifiedAt: now,
            lastLoginAt: now,
            isActive: true,
          },
        });

        await tx.authAccount.create({
          data: {
            tenantId,
            userId: createdUser.id,
            provider: 'GOOGLE',
            providerAccountId: input.providerAccountId,
            accessToken: input.accessToken,
            refreshToken: input.refreshToken,
          },
        });

        if (tenantWasCreated) {
          await this.assignOwnerRoleToUserTx(tx, tenantId, createdUser.id);
          await this.provisionInitialTenantResourcesTx(
            tx,
            tenantId,
            createdUser.id,
          );
        }

        return { tenant, user: createdUser };
      });

      return {
        token: this.signToken(user, tenant.slug),
        user: toSafeUser(user),
        tenant: toSafeTenant(tenant),
      };
    } catch (e: unknown) {
      if (isUniqueViolation(e)) {
        throw new ConflictException(
          'No se pudo vincular la cuenta de Google por conflicto de datos.',
        );
      }
      throw new BadRequestException('No se pudo autenticar con Google.');
    }
  }

  async me(payload: AuthJwtPayload): Promise<AuthMeResult> {
    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        tenantId: payload.tenantId,
        deletedAt: null,
        isActive: true,
      },
      include: {
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
      },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo.');
    }

    const { roles, ...safeUser } = toSafeUser(user);

    return {
      ...safeUser,
      tenantSlug: payload.tenantSlug,
      roles: roles
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
    };
  }

  getGoogleSuccessRedirectUrl(tenantSlug?: string): string {
    const baseUrl = this.config.getOrThrow<string>(
      'GOOGLE_SUCCESS_REDIRECT_URL',
    );

    if (!tenantSlug) {
      return baseUrl;
    }

    const encodedSlug = encodeURIComponent(tenantSlug);

    if (baseUrl.includes('[slug]')) {
      return baseUrl.replaceAll('[slug]', encodedSlug);
    }
    if (baseUrl.includes(':slug')) {
      return baseUrl.replaceAll(':slug', encodedSlug);
    }
    if (baseUrl.includes('{slug}')) {
      return baseUrl.replaceAll('{slug}', encodedSlug);
    }

    try {
      const url = new URL(baseUrl);
      url.searchParams.set('tenantSlug', tenantSlug);
      return url.toString();
    } catch {
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}tenantSlug=${encodedSlug}`;
    }
  }
}

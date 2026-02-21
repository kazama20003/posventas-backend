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
import { hashPassword, verifyPassword } from './utils/password.util';

type SafeUser = Omit<User, 'password'>;
type SafeTenant = Pick<Tenant, 'id' | 'name' | 'slug'>;

export type AuthResult = {
  token: string;
  user: SafeUser;
  tenant: SafeTenant;
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

function toSafeUser(user: User): SafeUser {
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

  private async createTenantWithFreePlanTx(
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

        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            plan: 'FREE',
            status: 'TRIALING',
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

        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            plan: 'FREE',
            status: 'TRIALING',
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

        if (input.tenantSlug) {
          const normalizedSlug = this.normalizeTenantSlug(input.tenantSlug);
          const existingTenant = await tx.tenant.findFirst({
            where: {
              slug: normalizedSlug,
              deletedAt: null,
            },
          });

          tenant =
            existingTenant ??
            (await this.createTenantWithFreePlanTx(
              tx,
              this.deriveBusinessNameForGoogle(input),
              normalizedSlug,
              false,
            ));
        } else {
          const businessName = this.deriveBusinessNameForGoogle(input);
          const generatedSlug = this.slugifyTenantName(businessName);
          tenant = await this.createTenantWithFreePlanTx(
            tx,
            businessName,
            generatedSlug,
            true,
          );
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

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';

type SafeUser = Omit<User, 'password'>;

function toSafeUser(user: User): SafeUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...safe } = user;
  return safe;
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

function handleUniqueError(e: Prisma.PrismaClientKnownRequestError): never {
  const targets = uniqueTargetsFromError(e);

  // Nota: con @@unique([tenantId, email]) el target a veces puede venir como ['tenantId','email']
  // o puede venir como nombre de constraint. Por eso manejamos ambos.
  if (targets.includes('email')) {
    throw new ConflictException(
      'Ya existe un usuario con ese email en este tenant.',
    );
  }
  if (targets.includes('ruc')) {
    throw new ConflictException(
      'Ya existe un usuario con ese RUC en este tenant.',
    );
  }

  throw new ConflictException(
    'Ya existe un usuario con datos únicos repetidos.',
  );
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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

  // CREATE (tenantId viene del auth)
  async create(tenantId: string, dto: CreateUserDto): Promise<SafeUser> {
    try {
      const user = await this.prisma.user.create({
        data: {
          tenantId,
          email: dto.email.toLowerCase().trim(),
          password: dto.password, // ⚠️ luego reemplaza por hash(dto.password)
          displayName: dto.displayName?.trim(),
          ruc: dto.ruc?.trim(),
          phone: dto.phone?.trim(),
          isActive: dto.isActive ?? true,
        },
      });

      return toSafeUser(user);
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') handleUniqueError(e);
      }
      throw new BadRequestException('No se pudo crear el usuario.');
    }
  }

  // FIND ALL (no borrados)
  async findAll(tenantId: string): Promise<SafeUser[]> {
    const users = await this.prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    return users.map(toSafeUser);
  }

  // FIND ONE (por id, no borrado)
  async findOne(tenantId: string, id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return toSafeUser(user);
  }

  // UPDATE (por id, no borrado)
  async update(
    tenantId: string,
    id: string,
    dto: UpdateUserDto,
  ): Promise<SafeUser> {
    const exists = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Usuario no encontrado.');

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          email: dto.email ? dto.email.toLowerCase().trim() : undefined,
          password: dto.password ? dto.password : undefined, // ⚠️ luego hash
          displayName: dto.displayName?.trim(),
          ruc: dto.ruc?.trim(),
          phone: dto.phone?.trim(),
          isActive: dto.isActive,
        },
      });

      return toSafeUser(user);
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') handleUniqueError(e);
      }
      throw new BadRequestException('No se pudo actualizar el usuario.');
    }
  }

  // SOFT DELETE
  async remove(tenantId: string, id: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    return { ok: true };
  }
}

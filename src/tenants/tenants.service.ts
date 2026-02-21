import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

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

  async findMe(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        updatedAt: true,
        subscription: {
          where: { deletedAt: null },
          select: {
            id: true,
            plan: true,
            status: true,
            provider: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            trialEndsAt: true,
            cancelAtPeriodEnd: true,
            canceledAt: true,
            lastProviderEventAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Empresa no encontrada.');
    }

    return tenant;
  }

  async updateMe(tenantId: string, dto: UpdateTenantDto) {
    if (typeof dto.name !== 'string') {
      throw new BadRequestException(
        'Debes enviar el campo name para actualizar la empresa.',
      );
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('El nombre de empresa es obligatorio.');
    }

    const slug = this.slugifyTenantName(name);

    try {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { name, slug },
      });

      return this.findMe(tenantId);
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2025') {
          throw new NotFoundException('Empresa no encontrada.');
        }
        if (e.code === 'P2002') {
          throw new ConflictException('Ese slug de empresa ya existe.');
        }
      }
      throw e;
    }
  }
}

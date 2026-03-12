import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCustomerDto,
  CustomerAddressDto,
} from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

const customerSelect = {
  id: true,
  tenantId: true,
  name: true,
  email: true,
  phone: true,
  createdAt: true,
  updatedAt: true,
  addresses: {
    where: {
      deletedAt: null,
    },
    orderBy: [{ id: 'asc' as const }],
    select: {
      id: true,
      line1: true,
      line2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
    },
  },
} satisfies Prisma.CustomerSelect;

type CustomerRecord = Prisma.CustomerGetPayload<{
  select: typeof customerSelect;
}>;

type CustomerResponse = CustomerRecord;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeRequiredName(name: string): string {
    const normalized = name.trim();
    if (!normalized) {
      throw new BadRequestException('El nombre del cliente es obligatorio.');
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

  private normalizeEmail(
    email: string | null | undefined,
  ): string | null | undefined {
    const normalized = this.normalizeOptionalString(email);
    return typeof normalized === 'string'
      ? normalized.toLowerCase()
      : normalized;
  }

  private normalizeAddresses(
    addresses: CustomerAddressDto[] | undefined,
  ): Prisma.CustomerAddressCreateWithoutCustomerInput[] | undefined {
    if (addresses === undefined) {
      return undefined;
    }

    return addresses.map((address, index) => {
      const line1 = address.line1.trim();
      if (!line1) {
        throw new BadRequestException(
          `La direccion ${index + 1} debe incluir una linea principal.`,
        );
      }

      return {
        line1,
        line2: this.normalizeOptionalString(address.line2),
        city: this.normalizeOptionalString(address.city),
        state: this.normalizeOptionalString(address.state),
        postalCode: this.normalizeOptionalString(address.postalCode),
        country: this.normalizeOptionalString(address.country),
      };
    });
  }

  private async findExistingCustomer(
    tenantId: string,
    id: string,
  ): Promise<CustomerRecord> {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: customerSelect,
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado.');
    }

    return customer;
  }

  async create(
    tenantId: string,
    createCustomerDto: CreateCustomerDto,
  ): Promise<CustomerResponse> {
    try {
      return await this.prisma.customer.create({
        data: {
          tenantId,
          name: this.normalizeRequiredName(createCustomerDto.name),
          email: this.normalizeEmail(createCustomerDto.email),
          phone: this.normalizeOptionalString(createCustomerDto.phone),
          addresses: createCustomerDto.addresses
            ? {
                create: this.normalizeAddresses(createCustomerDto.addresses),
              }
            : undefined,
        },
        select: customerSelect,
      });
    } catch (e: unknown) {
      if (e instanceof BadRequestException) {
        throw e;
      }
      throw new BadRequestException('No se pudo crear el cliente.');
    }
  }

  async findAll(tenantId: string): Promise<CustomerResponse[]> {
    return this.prisma.customer.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }],
      select: customerSelect,
    });
  }

  async findOne(tenantId: string, id: string): Promise<CustomerResponse> {
    return this.findExistingCustomer(tenantId, id);
  }

  async update(
    tenantId: string,
    id: string,
    updateCustomerDto: UpdateCustomerDto,
  ): Promise<CustomerResponse> {
    await this.findExistingCustomer(tenantId, id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (updateCustomerDto.addresses !== undefined) {
          await tx.customerAddress.updateMany({
            where: {
              customerId: id,
              deletedAt: null,
            },
            data: {
              deletedAt: new Date(),
            },
          });
        }

        return tx.customer.update({
          where: { id },
          data: {
            name:
              updateCustomerDto.name !== undefined
                ? this.normalizeRequiredName(updateCustomerDto.name)
                : undefined,
            email: this.normalizeEmail(updateCustomerDto.email),
            phone: this.normalizeOptionalString(updateCustomerDto.phone),
            addresses:
              updateCustomerDto.addresses !== undefined
                ? {
                    create: this.normalizeAddresses(
                      updateCustomerDto.addresses,
                    ),
                  }
                : undefined,
          },
          select: customerSelect,
        });
      });
    } catch (e: unknown) {
      if (e instanceof BadRequestException) {
        throw e;
      }
      throw new BadRequestException('No se pudo actualizar el cliente.');
    }
  }

  async remove(tenantId: string, id: string): Promise<{ ok: true }> {
    await this.findExistingCustomer(tenantId, id);

    const activeOrdersCount = await this.prisma.order.count({
      where: {
        tenantId,
        customerId: id,
        deletedAt: null,
      },
    });

    if (activeOrdersCount > 0) {
      throw new BadRequestException(
        'No puedes eliminar un cliente con pedidos asociados.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.customerAddress.updateMany({
        where: {
          customerId: id,
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      await tx.customer.update({
        where: { id },
        data: {
          deletedAt: new Date(),
        },
      });
    });

    return { ok: true };
  }
}

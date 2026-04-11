import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashMovementType,
  CashSessionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';
import { UpdateCashRegisterDto } from './dto/update-cash-register.dto';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import {
  CASH_MOVEMENT_MANUAL_TYPES,
  type CashMovementManualType,
  CreateCashMovementDto,
} from './dto/create-cash-movement.dto';

const cashRegisterSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  name: true,
  code: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  store: {
    select: {
      id: true,
      name: true,
      code: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.CashRegisterSelect;

const cashSessionSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  cashRegisterId: true,
  openedById: true,
  closedById: true,
  status: true,
  openingAmount: true,
  expectedClosingAmount: true,
  countedClosingAmount: true,
  notes: true,
  openedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  cashRegister: {
    select: {
      id: true,
      name: true,
      code: true,
      isActive: true,
      deletedAt: true,
    },
  },
  openedBy: {
    select: {
      id: true,
      email: true,
      displayName: true,
      deletedAt: true,
    },
  },
  closedBy: {
    select: {
      id: true,
      email: true,
      displayName: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.CashSessionSelect;

const cashMovementSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  cashRegisterId: true,
  cashSessionId: true,
  orderId: true,
  paymentId: true,
  createdById: true,
  type: true,
  amount: true,
  reason: true,
  referenceId: true,
  createdAt: true,
  cashRegister: {
    select: {
      id: true,
      name: true,
      code: true,
      deletedAt: true,
    },
  },
  cashSession: {
    select: {
      id: true,
      status: true,
      openedAt: true,
      closedAt: true,
      deletedAt: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      email: true,
      displayName: true,
      deletedAt: true,
    },
  },
  order: {
    select: {
      id: true,
      code: true,
      status: true,
      deletedAt: true,
    },
  },
  payment: {
    select: {
      id: true,
      provider: true,
      status: true,
      paidAt: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.CashMovementSelect;

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type CashRegisterRecord = Prisma.CashRegisterGetPayload<{
  select: typeof cashRegisterSelect;
}>;

type CashSessionRecord = Prisma.CashSessionGetPayload<{
  select: typeof cashSessionSelect;
}>;

type CashMovementRecord = Prisma.CashMovementGetPayload<{
  select: typeof cashMovementSelect;
}>;

function uniqueTargetsFromError(
  e: Prisma.PrismaClientKnownRequestError,
): string[] {
  const target = e.meta?.target;
  if (Array.isArray(target)) {
    return target.filter((x): x is string => typeof x === 'string');
  }
  return typeof target === 'string' ? [target] : [];
}

function mapCashRegister(record: CashRegisterRecord) {
  return {
    id: record.id,
    tenantId: record.tenantId,
    storeId: record.storeId,
    name: record.name,
    code: record.code,
    isActive: record.isActive,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    store:
      record.store.deletedAt === null
        ? {
            id: record.store.id,
            name: record.store.name,
            code: record.store.code,
          }
        : null,
  };
}

function mapCashSession(record: CashSessionRecord) {
  const expectedClosingAmount = record.expectedClosingAmount?.toNumber() ?? null;
  const countedClosingAmount = record.countedClosingAmount?.toNumber() ?? null;

  return {
    id: record.id,
    tenantId: record.tenantId,
    storeId: record.storeId,
    cashRegisterId: record.cashRegisterId,
    openedById: record.openedById,
    closedById: record.closedById,
    status: record.status,
    openingAmount: record.openingAmount.toNumber(),
    expectedClosingAmount,
    countedClosingAmount,
    differenceAmount:
      expectedClosingAmount !== null && countedClosingAmount !== null
        ? countedClosingAmount - expectedClosingAmount
        : null,
    notes: record.notes,
    openedAt: record.openedAt,
    closedAt: record.closedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    cashRegister:
      record.cashRegister.deletedAt === null
        ? {
            id: record.cashRegister.id,
            name: record.cashRegister.name,
            code: record.cashRegister.code,
            isActive: record.cashRegister.isActive,
          }
        : null,
    openedBy:
      record.openedBy.deletedAt === null
        ? {
            id: record.openedBy.id,
            email: record.openedBy.email,
            displayName: record.openedBy.displayName,
          }
        : null,
    closedBy:
      record.closedBy && record.closedBy.deletedAt === null
        ? {
            id: record.closedBy.id,
            email: record.closedBy.email,
            displayName: record.closedBy.displayName,
          }
        : null,
  };
}

function mapCashMovement(record: CashMovementRecord) {
  return {
    id: record.id,
    tenantId: record.tenantId,
    storeId: record.storeId,
    cashRegisterId: record.cashRegisterId,
    cashSessionId: record.cashSessionId,
    orderId: record.orderId,
    paymentId: record.paymentId,
    createdById: record.createdById,
    type: record.type,
    amount: record.amount.toNumber(),
    reason: record.reason,
    referenceId: record.referenceId,
    createdAt: record.createdAt,
    cashRegister:
      record.cashRegister.deletedAt === null
        ? {
            id: record.cashRegister.id,
            name: record.cashRegister.name,
            code: record.cashRegister.code,
          }
        : null,
    cashSession:
      record.cashSession && record.cashSession.deletedAt === null
        ? {
            id: record.cashSession.id,
            status: record.cashSession.status,
            openedAt: record.cashSession.openedAt,
            closedAt: record.cashSession.closedAt,
          }
        : null,
    createdBy:
      record.createdBy && record.createdBy.deletedAt === null
        ? {
            id: record.createdBy.id,
            email: record.createdBy.email,
            displayName: record.createdBy.displayName,
          }
        : null,
    order:
      record.order && record.order.deletedAt === null
        ? {
            id: record.order.id,
            code: record.order.code,
            status: record.order.status,
          }
        : null,
    payment:
      record.payment && record.payment.deletedAt === null
        ? {
            id: record.payment.id,
            provider: record.payment.provider,
            status: record.payment.status,
            paidAt: record.payment.paidAt,
          }
        : null,
  };
}

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeName(name: string): string {
    const normalized = name.trim();
    if (!normalized) {
      throw new BadRequestException('El nombre de caja es obligatorio.');
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

  private normalizeCode(code: string | undefined): string | null | undefined {
    if (code === undefined) {
      return undefined;
    }
    const normalized = code.trim().toUpperCase();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeMoney(
    value: number,
    fieldName: string,
    allowZero = true,
  ): Prisma.Decimal {
    if (!Number.isFinite(value)) {
      throw new BadRequestException(`${fieldName} debe ser un numero valido.`);
    }
    if (allowZero ? value < 0 : value <= 0) {
      throw new BadRequestException(
        allowZero
          ? `${fieldName} no puede ser negativo.`
          : `${fieldName} debe ser mayor que cero.`,
      );
    }
    return new Prisma.Decimal(value);
  }

  private movementEffect(type: CashMovementType, amount: Prisma.Decimal): number {
    switch (type) {
      case CashMovementType.OPENING_FLOAT:
      case CashMovementType.SALE:
      case CashMovementType.CASH_IN:
      case CashMovementType.ADJUSTMENT:
        return amount.toNumber();
      case CashMovementType.REFUND:
      case CashMovementType.CASH_OUT:
        return -amount.toNumber();
      case CashMovementType.CLOSING:
      default:
        return 0;
    }
  }

  private handleRegisterUniqueError(
    e: Prisma.PrismaClientKnownRequestError,
  ): never {
    const targets = uniqueTargetsFromError(e);
    if (
      targets.includes('code') ||
      targets.includes('storeId,code') ||
      targets.includes('CashRegister_storeId_code_key')
    ) {
      throw new ConflictException(
        'Ya existe una caja con ese codigo en esta sucursal.',
      );
    }
    throw new ConflictException('Ya existe una caja con datos unicos.');
  }

  private handleSessionUniqueError(
    e: Prisma.PrismaClientKnownRequestError,
  ): never {
    const targets = uniqueTargetsFromError(e);
    if (
      targets.includes('CashSession_one_open_per_register_idx') ||
      targets.includes('cashRegisterId')
    ) {
      throw new ConflictException('La caja ya tiene una sesion abierta.');
    }
    throw new ConflictException('No se pudo abrir la sesion de caja.');
  }

  private async validateStore(
    prismaClient: PrismaExecutor,
    tenantId: string,
    storeId: string,
  ): Promise<string> {
    const store = await prismaClient.store.findFirst({
      where: { id: storeId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!store) {
      throw new BadRequestException(
        'La sucursal indicada no existe en esta empresa.',
      );
    }
    return store.id;
  }

  private async validateUser(
    prismaClient: PrismaExecutor,
    tenantId: string,
    userId: string,
  ): Promise<string> {
    const user = await prismaClient.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException(
        'El usuario autenticado no existe o no esta activo.',
      );
    }
    return user.id;
  }

  private async findCashRegisterEntity(
    prismaClient: PrismaExecutor,
    tenantId: string,
    id: string,
  ) {
    const cashRegister = await prismaClient.cashRegister.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true,
        storeId: true,
        isActive: true,
        deletedAt: true,
        store: { select: { deletedAt: true } },
      },
    });
    if (!cashRegister || cashRegister.deletedAt !== null) {
      throw new NotFoundException('Caja no encontrada.');
    }
    if (cashRegister.store.deletedAt !== null) {
      throw new BadRequestException('La sucursal de la caja ya no esta activa.');
    }
    return cashRegister;
  }

  private async ensureActiveCashRegister(
    prismaClient: PrismaExecutor,
    tenantId: string,
    id: string,
  ) {
    const cashRegister = await this.findCashRegisterEntity(
      prismaClient,
      tenantId,
      id,
    );
    if (!cashRegister.isActive) {
      throw new BadRequestException('La caja indicada no esta activa.');
    }
    return cashRegister;
  }

  private async findCashSessionEntity(
    prismaClient: PrismaExecutor,
    tenantId: string,
    id: string,
  ) {
    const session = await prismaClient.cashSession.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: {
        id: true,
        storeId: true,
        cashRegisterId: true,
        status: true,
        deletedAt: true,
      },
    });
    if (!session || session.deletedAt !== null) {
      throw new NotFoundException('Sesion de caja no encontrada.');
    }
    return session;
  }

  private async findOpenSessionEntityByRegister(
    prismaClient: PrismaExecutor,
    tenantId: string,
    cashRegisterId: string,
  ) {
    return prismaClient.cashSession.findFirst({
      where: {
        tenantId,
        cashRegisterId,
        status: CashSessionStatus.OPEN,
        deletedAt: null,
      },
      select: {
        id: true,
        storeId: true,
        cashRegisterId: true,
        status: true,
        deletedAt: true,
      },
    });
  }

  private async calculateExpectedClosingAmount(
    prismaClient: PrismaExecutor,
    tenantId: string,
    cashSessionId: string,
  ): Promise<Prisma.Decimal> {
    const movements = await prismaClient.cashMovement.findMany({
      where: { tenantId, cashSessionId, deletedAt: null },
      select: { type: true, amount: true },
    });

    return new Prisma.Decimal(
      movements.reduce(
        (sum, movement) => sum + this.movementEffect(movement.type, movement.amount),
        0,
      ),
    );
  }

  private ensureManualMovementType(type: string): CashMovementManualType {
    if (!CASH_MOVEMENT_MANUAL_TYPES.includes(type as CashMovementManualType)) {
      throw new BadRequestException(
        'Solo se permiten movimientos manuales CASH_IN o CASH_OUT.',
      );
    }
    return type as CashMovementManualType;
  }

  async createRegister(tenantId: string, dto: CreateCashRegisterDto) {
    await this.validateStore(this.prisma, tenantId, dto.storeId);
    try {
      const cashRegister = await this.prisma.cashRegister.create({
        data: {
          tenantId,
          storeId: dto.storeId,
          name: this.normalizeName(dto.name),
          code: this.normalizeCode(dto.code),
        },
        select: cashRegisterSelect,
      });
      return mapCashRegister(cashRegister);
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        this.handleRegisterUniqueError(e);
      }
      if (e instanceof BadRequestException || e instanceof ConflictException) {
        throw e;
      }
      throw new BadRequestException('No se pudo crear la caja.');
    }
  }

  async findAllRegisters(tenantId: string) {
    const cashRegisters = await this.prisma.cashRegister.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }],
      select: cashRegisterSelect,
    });
    return cashRegisters.map(mapCashRegister);
  }

  async findOneRegister(tenantId: string, id: string) {
    const cashRegister = await this.prisma.cashRegister.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: cashRegisterSelect,
    });
    if (!cashRegister) {
      throw new NotFoundException('Caja no encontrada.');
    }
    return mapCashRegister(cashRegister);
  }

  async updateRegister(
    tenantId: string,
    id: string,
    dto: UpdateCashRegisterDto,
  ) {
    await this.findCashRegisterEntity(this.prisma, tenantId, id);

    if (dto.isActive === false) {
      const openSession = await this.findOpenSessionEntityByRegister(
        this.prisma,
        tenantId,
        id,
      );
      if (openSession) {
        throw new BadRequestException(
          'No puedes desactivar una caja con una sesion abierta.',
        );
      }
    }

    try {
      const cashRegister = await this.prisma.cashRegister.update({
        where: { id },
        data: {
          name: dto.name !== undefined ? this.normalizeName(dto.name) : undefined,
          code: this.normalizeCode(dto.code),
          isActive: dto.isActive,
        },
        select: cashRegisterSelect,
      });
      return mapCashRegister(cashRegister);
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        this.handleRegisterUniqueError(e);
      }
      if (e instanceof BadRequestException || e instanceof ConflictException) {
        throw e;
      }
      throw new BadRequestException('No se pudo actualizar la caja.');
    }
  }

  async removeRegister(tenantId: string, id: string): Promise<{ ok: true }> {
    await this.findCashRegisterEntity(this.prisma, tenantId, id);

    const openSession = await this.findOpenSessionEntityByRegister(
      this.prisma,
      tenantId,
      id,
    );
    if (openSession) {
      throw new BadRequestException(
        'No puedes eliminar una caja con una sesion abierta.',
      );
    }

    await this.prisma.cashRegister.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    return { ok: true };
  }

  async findOpenSessionForRegister(tenantId: string, cashRegisterId: string) {
    await this.findCashRegisterEntity(this.prisma, tenantId, cashRegisterId);

    const session = await this.prisma.cashSession.findFirst({
      where: {
        tenantId,
        cashRegisterId,
        status: CashSessionStatus.OPEN,
        deletedAt: null,
      },
      orderBy: [{ openedAt: 'desc' }],
      select: cashSessionSelect,
    });

    return session ? mapCashSession(session) : null;
  }

  async openSession(
    tenantId: string,
    userId: string,
    dto: OpenCashSessionDto,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const openedById = await this.validateUser(tx, tenantId, userId);
        const cashRegister = await this.ensureActiveCashRegister(
          tx,
          tenantId,
          dto.cashRegisterId,
        );

        const existingOpenSession = await this.findOpenSessionEntityByRegister(
          tx,
          tenantId,
          cashRegister.id,
        );
        if (existingOpenSession) {
          throw new ConflictException('La caja ya tiene una sesion abierta.');
        }

        const openingAmount = this.normalizeMoney(
          dto.openingAmount,
          'El monto de apertura',
        );
        const session = await tx.cashSession.create({
          data: {
            tenantId,
            storeId: cashRegister.storeId,
            cashRegisterId: cashRegister.id,
            openedById,
            status: CashSessionStatus.OPEN,
            openingAmount,
            notes: this.normalizeOptionalString(dto.notes),
          },
          select: cashSessionSelect,
        });

        await tx.cashMovement.create({
          data: {
            tenantId,
            storeId: cashRegister.storeId,
            cashRegisterId: cashRegister.id,
            cashSessionId: session.id,
            createdById: openedById,
            type: CashMovementType.OPENING_FLOAT,
            amount: openingAmount,
            reason: 'Apertura de caja',
          },
        });

        return mapCashSession(session);
      });
    } catch (e: unknown) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        this.handleSessionUniqueError(e);
      }
      if (
        e instanceof BadRequestException ||
        e instanceof ConflictException ||
        e instanceof NotFoundException
      ) {
        throw e;
      }
      throw new BadRequestException('No se pudo abrir la sesion de caja.');
    }
  }

  async findAllSessions(tenantId: string) {
    const sessions = await this.prisma.cashSession.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ openedAt: 'desc' }],
      select: cashSessionSelect,
    });
    return sessions.map(mapCashSession);
  }

  async findOneSession(tenantId: string, id: string) {
    const session = await this.prisma.cashSession.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: cashSessionSelect,
    });
    if (!session) {
      throw new NotFoundException('Sesion de caja no encontrada.');
    }
    return mapCashSession(session);
  }

  async closeSession(
    tenantId: string,
    userId: string,
    id: string,
    dto: CloseCashSessionDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const closedById = await this.validateUser(tx, tenantId, userId);
      const session = await this.findCashSessionEntity(tx, tenantId, id);

      if (session.status !== CashSessionStatus.OPEN) {
        throw new BadRequestException(
          'Solo puedes cerrar una sesion que esta abierta.',
        );
      }

      const expectedClosingAmount = await this.calculateExpectedClosingAmount(
        tx,
        tenantId,
        session.id,
      );
      const countedClosingAmount = this.normalizeMoney(
        dto.countedClosingAmount,
        'El monto de cierre contado',
      );

      const updatedSession = await tx.cashSession.update({
        where: { id: session.id },
        data: {
          status: CashSessionStatus.CLOSED,
          closedById,
          closedAt: new Date(),
          expectedClosingAmount,
          countedClosingAmount,
          notes: this.normalizeOptionalString(dto.notes),
        },
        select: cashSessionSelect,
      });

      await tx.cashMovement.create({
        data: {
          tenantId,
          storeId: session.storeId,
          cashRegisterId: session.cashRegisterId,
          cashSessionId: session.id,
          createdById: closedById,
          type: CashMovementType.CLOSING,
          amount: countedClosingAmount,
          reason: 'Cierre de caja',
        },
      });

      return mapCashSession(updatedSession);
    });
  }

  async createMovement(
    tenantId: string,
    userId: string,
    dto: CreateCashMovementDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const createdById = await this.validateUser(tx, tenantId, userId);
      const cashRegister = await this.ensureActiveCashRegister(
        tx,
        tenantId,
        dto.cashRegisterId,
      );
      const type = this.ensureManualMovementType(dto.type);

      const session = dto.cashSessionId
        ? await this.findCashSessionEntity(tx, tenantId, dto.cashSessionId)
        : await this.findOpenSessionEntityByRegister(tx, tenantId, cashRegister.id);

      if (!session || session.status !== CashSessionStatus.OPEN) {
        throw new BadRequestException(
          'Debes tener una sesion de caja abierta para registrar este movimiento.',
        );
      }
      if (session.cashRegisterId !== cashRegister.id) {
        throw new BadRequestException(
          'La sesion indicada no pertenece a la caja seleccionada.',
        );
      }

      const movement = await tx.cashMovement.create({
        data: {
          tenantId,
          storeId: cashRegister.storeId,
          cashRegisterId: cashRegister.id,
          cashSessionId: session.id,
          createdById,
          type: type as CashMovementType,
          amount: this.normalizeMoney(dto.amount, 'El monto del movimiento', false),
          reason:
            this.normalizeOptionalString(dto.reason) ??
            'Movimiento manual de caja',
          referenceId: this.normalizeOptionalString(dto.referenceId),
        },
        select: cashMovementSelect,
      });

      return mapCashMovement(movement);
    });
  }

  async findAllMovements(tenantId: string) {
    const movements = await this.prisma.cashMovement.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }],
      select: cashMovementSelect,
    });
    return movements.map(mapCashMovement);
  }

  async findOneMovement(tenantId: string, id: string) {
    const movement = await this.prisma.cashMovement.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: cashMovementSelect,
    });
    if (!movement) {
      throw new NotFoundException('Movimiento de caja no encontrado.');
    }
    return mapCashMovement(movement);
  }
}

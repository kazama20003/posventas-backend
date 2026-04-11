import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthJwtPayload } from '../auth/types/auth-jwt-payload.type';
import { CashService } from './cash.service';
import { CreateCashRegisterDto } from './dto/create-cash-register.dto';
import { UpdateCashRegisterDto } from './dto/update-cash-register.dto';
import { OpenCashSessionDto } from './dto/open-cash-session.dto';
import { CloseCashSessionDto } from './dto/close-cash-session.dto';
import { CreateCashMovementDto } from './dto/create-cash-movement.dto';

@Controller('cash')
@UseGuards(JwtAuthGuard)
export class CashController {
  constructor(private readonly cashService: CashService) {}

  @Post('registers')
  createRegister(
    @Req() req: Request & { user: AuthJwtPayload },
    @Body() createCashRegisterDto: CreateCashRegisterDto,
  ) {
    return this.cashService.createRegister(
      req.user.tenantId,
      createCashRegisterDto,
    );
  }

  @Get('registers')
  findAllRegisters(@Req() req: Request & { user: AuthJwtPayload }) {
    return this.cashService.findAllRegisters(req.user.tenantId);
  }

  @Get('registers/:id')
  findOneRegister(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.cashService.findOneRegister(req.user.tenantId, id);
  }

  @Patch('registers/:id')
  updateRegister(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
    @Body() updateCashRegisterDto: UpdateCashRegisterDto,
  ) {
    return this.cashService.updateRegister(
      req.user.tenantId,
      id,
      updateCashRegisterDto,
    );
  }

  @Delete('registers/:id')
  removeRegister(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.cashService.removeRegister(req.user.tenantId, id);
  }

  @Get('registers/:id/open-session')
  findOpenSessionForRegister(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.cashService.findOpenSessionForRegister(req.user.tenantId, id);
  }

  @Post('sessions/open')
  openSession(
    @Req() req: Request & { user: AuthJwtPayload },
    @Body() openCashSessionDto: OpenCashSessionDto,
  ) {
    return this.cashService.openSession(
      req.user.tenantId,
      req.user.sub,
      openCashSessionDto,
    );
  }

  @Get('sessions')
  findAllSessions(@Req() req: Request & { user: AuthJwtPayload }) {
    return this.cashService.findAllSessions(req.user.tenantId);
  }

  @Get('sessions/:id')
  findOneSession(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.cashService.findOneSession(req.user.tenantId, id);
  }

  @Post('sessions/:id/close')
  closeSession(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
    @Body() closeCashSessionDto: CloseCashSessionDto,
  ) {
    return this.cashService.closeSession(
      req.user.tenantId,
      req.user.sub,
      id,
      closeCashSessionDto,
    );
  }

  @Post('movements')
  createMovement(
    @Req() req: Request & { user: AuthJwtPayload },
    @Body() createCashMovementDto: CreateCashMovementDto,
  ) {
    return this.cashService.createMovement(
      req.user.tenantId,
      req.user.sub,
      createCashMovementDto,
    );
  }

  @Get('movements')
  findAllMovements(@Req() req: Request & { user: AuthJwtPayload }) {
    return this.cashService.findAllMovements(req.user.tenantId);
  }

  @Get('movements/:id')
  findOneMovement(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.cashService.findOneMovement(req.user.tenantId, id);
  }
}

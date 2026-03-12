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
import { InventoriesService } from './inventories.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto';

@Controller('inventories')
@UseGuards(JwtAuthGuard)
export class InventoriesController {
  constructor(private readonly inventoriesService: InventoriesService) {}

  @Post()
  create(
    @Req() req: Request & { user: AuthJwtPayload },
    @Body() createInventoryDto: CreateInventoryDto,
  ) {
    return this.inventoriesService.create(
      req.user.tenantId,
      req.user.sub,
      createInventoryDto,
    );
  }

  @Get()
  findAll(@Req() req: Request & { user: AuthJwtPayload }) {
    return this.inventoriesService.findAll(req.user.tenantId);
  }

  @Post('movements')
  createMovement(
    @Req() req: Request & { user: AuthJwtPayload },
    @Body() createInventoryMovementDto: CreateInventoryMovementDto,
  ) {
    return this.inventoriesService.createMovement(
      req.user.tenantId,
      req.user.sub,
      createInventoryMovementDto,
    );
  }

  @Get('movements')
  findAllMovements(@Req() req: Request & { user: AuthJwtPayload }) {
    return this.inventoriesService.findAllMovements(req.user.tenantId);
  }

  @Get('movements/:id')
  findOneMovement(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.inventoriesService.findOneMovement(req.user.tenantId, id);
  }

  @Get(':id')
  findOne(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.inventoriesService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  update(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
    @Body() updateInventoryDto: UpdateInventoryDto,
  ) {
    return this.inventoriesService.update(
      req.user.tenantId,
      req.user.sub,
      id,
      updateInventoryDto,
    );
  }

  @Delete(':id')
  remove(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.inventoriesService.remove(req.user.tenantId, id);
  }
}

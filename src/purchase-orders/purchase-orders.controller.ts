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
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@Controller('purchase-orders')
@UseGuards(JwtAuthGuard)
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post()
  create(
    @Req() req: Request & { user: AuthJwtPayload },
    @Body() createPurchaseOrderDto: CreatePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.create(
      req.user.tenantId,
      createPurchaseOrderDto,
    );
  }

  @Get()
  findAll(@Req() req: Request & { user: AuthJwtPayload }) {
    return this.purchaseOrdersService.findAll(req.user.tenantId);
  }

  @Get(':id')
  findOne(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.purchaseOrdersService.findOne(req.user.tenantId, id);
  }

  @Post(':id/receive')
  receive(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
    @Body() receivePurchaseOrderDto: ReceivePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.receive(
      req.user.tenantId,
      req.user.sub,
      id,
      receivePurchaseOrderDto,
    );
  }

  @Patch(':id')
  update(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
    @Body() updatePurchaseOrderDto: UpdatePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.update(
      req.user.tenantId,
      id,
      updatePurchaseOrderDto,
    );
  }

  @Delete(':id')
  remove(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.purchaseOrdersService.remove(req.user.tenantId, id);
  }
}

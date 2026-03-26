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
import { FulfillOrderDto } from './dto/fulfill-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(
    @Req() req: Request & { user: AuthJwtPayload },
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return this.ordersService.create(req.user.tenantId, createOrderDto);
  }

  @Get()
  findAll(@Req() req: Request & { user: AuthJwtPayload }) {
    return this.ordersService.findAll(req.user.tenantId);
  }

  @Get(':id')
  findOne(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.ordersService.findOne(req.user.tenantId, id);
  }

  @Post(':id/fulfill')
  fulfill(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
    @Body() fulfillOrderDto: FulfillOrderDto,
  ) {
    return this.ordersService.fulfill(
      req.user.tenantId,
      req.user.sub,
      id,
      fulfillOrderDto,
    );
  }

  @Patch(':id')
  update(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
  ) {
    return this.ordersService.update(req.user.tenantId, id, updateOrderDto);
  }

  @Delete(':id')
  remove(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.ordersService.remove(req.user.tenantId, id);
  }
}

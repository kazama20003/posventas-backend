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
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(
    @Req() req: Request & { user: AuthJwtPayload },
    @Body() createCustomerDto: CreateCustomerDto,
  ) {
    return this.customersService.create(req.user.tenantId, createCustomerDto);
  }

  @Get()
  findAll(@Req() req: Request & { user: AuthJwtPayload }) {
    return this.customersService.findAll(req.user.tenantId);
  }

  @Get(':id')
  findOne(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.customersService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  update(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
  ) {
    return this.customersService.update(
      req.user.tenantId,
      id,
      updateCustomerDto,
    );
  }

  @Delete(':id')
  remove(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.customersService.remove(req.user.tenantId, id);
  }
}

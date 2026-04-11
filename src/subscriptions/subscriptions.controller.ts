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
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  create(
    @Req() req: Request & { user: AuthJwtPayload },
    @Body() createSubscriptionDto: CreateSubscriptionDto,
  ) {
    return this.subscriptionsService.create(
      req.user.tenantId,
      createSubscriptionDto,
    );
  }

  @Get()
  findAll(@Req() req: Request & { user: AuthJwtPayload }) {
    return this.subscriptionsService.findAll(req.user.tenantId);
  }

  @Get(':id')
  findOne(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.subscriptionsService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  update(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
    @Body() updateSubscriptionDto: UpdateSubscriptionDto,
  ) {
    return this.subscriptionsService.update(
      req.user.tenantId,
      id,
      updateSubscriptionDto,
    );
  }

  @Delete(':id')
  remove(
    @Req() req: Request & { user: AuthJwtPayload },
    @Param('id') id: string,
  ) {
    return this.subscriptionsService.remove(req.user.tenantId, id);
  }
}

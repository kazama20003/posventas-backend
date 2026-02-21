import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthJwtPayload } from '../auth/types/auth-jwt-payload.type';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  findMe(@Req() req: Request & { user: AuthJwtPayload }) {
    return this.tenantsService.findMe(req.user.tenantId);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(
    @Req() req: Request & { user: AuthJwtPayload },
    @Body() updateTenantDto: UpdateTenantDto,
  ) {
    return this.tenantsService.updateMe(req.user.tenantId, updateTenantDto);
  }
}

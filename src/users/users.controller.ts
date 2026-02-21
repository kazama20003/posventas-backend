import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private getTenantId(
    headers: Record<string, string | string[] | undefined>,
  ): string {
    const raw = headers['x-tenant-id'];
    const tenantId = Array.isArray(raw) ? raw[0] : raw;

    if (
      !tenantId ||
      typeof tenantId !== 'string' ||
      tenantId.trim().length === 0
    ) {
      throw new BadRequestException('Falta el header x-tenant-id');
    }
    return tenantId.trim();
  }

  @Post()
  create(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() createUserDto: CreateUserDto,
  ) {
    const tenantId = this.getTenantId(headers);
    return this.usersService.create(tenantId, createUserDto);
  }

  @Get()
  findAll(@Headers() headers: Record<string, string | string[] | undefined>) {
    const tenantId = this.getTenantId(headers);
    return this.usersService.findAll(tenantId);
  }

  @Get('tenant/:slug')
  findTenantBySlug(@Param('slug') slug: string) {
    return this.usersService.findTenantBySlug(slug);
  }

  @Get(':id')
  findOne(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
  ) {
    const tenantId = this.getTenantId(headers);
    return this.usersService.findOne(tenantId, id);
  }

  @Patch(':id')
  update(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const tenantId = this.getTenantId(headers);
    return this.usersService.update(tenantId, id, updateUserDto);
  }

  @Delete(':id')
  remove(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
  ) {
    const tenantId = this.getTenantId(headers);
    return this.usersService.remove(tenantId, id);
  }
}

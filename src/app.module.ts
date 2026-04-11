import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import { envValidationSchema } from './config/env.validation';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { TenantsModule } from './tenants/tenants.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { StoresModule } from './stores/stores.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { UploadsModule } from './uploads/uploads.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { InventoriesModule } from './inventories/inventories.module';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module';
import { CustomersModule } from './customers/customers.module';
import { OrdersModule } from './orders/orders.module';
import { CashModule } from './cash/cash.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [appConfig, databaseConfig],
      validationSchema: envValidationSchema,
      validationOptions: {
        abortEarly: false,
        allowUnknown: true,
      },
    }),
    UsersModule,
    AuthModule,
    PrismaModule,
    TenantsModule,
    SubscriptionsModule,
    StoresModule,
    CategoriesModule,
    ProductsModule,
    SuppliersModule,
    UploadsModule,
    WarehousesModule,
    InventoriesModule,
    PurchaseOrdersModule,
    CustomersModule,
    OrdersModule,
    CashModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

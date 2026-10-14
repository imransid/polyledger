import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from './auth/auth.module.js';
import { envSchema } from './config/env.js';
import { CustomersModule } from './customers/customers.module.js';
import { DatabaseModule } from './database/database.module.js';
import { DispatchModule } from './dispatch/dispatch.module.js';
import { FormulasModule } from './formulas/formulas.module.js';
import { HealthController } from './health/health.controller.js';
import { MachinesModule } from './machines/machines.module.js';
import { MaterialsModule } from './materials/materials.module.js';
import { MouldsModule } from './moulds/moulds.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { ProductionModule } from './production/production.module.js';
import { ProductsModule } from './products/products.module.js';
import { ScrapModule } from './scrap/scrap.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { StockModule } from './stock/stock.module.js';
import { SuppliersModule } from './suppliers/suppliers.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
      // Tests take their environment from vitest.config.ts, never from a
      // developer's .env (which may seed an OWNER, for example).
      ignoreEnvFile: process.env.NODE_ENV === 'test',
    }),
    CqrsModule.forRoot(),
    DatabaseModule,
    AuthModule,
    MaterialsModule,
    ProductsModule,
    MouldsModule,
    MachinesModule,
    CustomersModule,
    SuppliersModule,
    FormulasModule,
    StockModule,
    OrdersModule,
    ProductionModule,
    ScrapModule,
    DispatchModule,
    SettingsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_PIPE, useValue: new StandardSchemaValidationPipe() },
  ],
})
export class AppModule {}

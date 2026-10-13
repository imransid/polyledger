import { Module } from '@nestjs/common';
import { CancelSalesOrderHandler } from './commands/cancel-sales-order.js';
import { ChangeSalesOrderHandler } from './commands/change-sales-order.js';
import { CompleteSalesOrderHandler } from './commands/complete-sales-order.js';
import { ConfirmSalesOrderHandler } from './commands/confirm-sales-order.js';
import { CreateSalesOrderHandler } from './commands/create-sales-order.js';
import { StartProductionHandler } from './commands/start-production.js';
import { MaterialPlanner } from './infra/material-planner.js';
import { GetMaterialCheckHandler } from './queries/get-material-check.js';
import { GetMaterialShortagesHandler } from './queries/get-material-shortages.js';
import { GetSalesOrderHandler } from './queries/get-sales-order.js';
import { ListSalesOrdersHandler } from './queries/list-sales-orders.js';
import { SalesOrdersController } from './sales-orders.controller.js';

@Module({
  controllers: [SalesOrdersController],
  providers: [
    MaterialPlanner,
    CreateSalesOrderHandler,
    ChangeSalesOrderHandler,
    ConfirmSalesOrderHandler,
    StartProductionHandler,
    CompleteSalesOrderHandler,
    CancelSalesOrderHandler,
    ListSalesOrdersHandler,
    GetSalesOrderHandler,
    GetMaterialCheckHandler,
    GetMaterialShortagesHandler,
  ],
})
export class OrdersModule {}

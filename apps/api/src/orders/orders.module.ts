import { Module } from '@nestjs/common';
import { CancelSalesOrderHandler } from './commands/cancel-sales-order.js';
import { ChangeSalesOrderHandler } from './commands/change-sales-order.js';
import { AdjustDeliveriesHandler } from './commands/adjust-deliveries.js';
import { CloseOrderShortHandler } from './commands/close-order-short.js';
import { ConfirmSalesOrderHandler } from './commands/confirm-sales-order.js';
import { CreateSalesOrderHandler } from './commands/create-sales-order.js';
import { DeliverOrderHandler } from './commands/deliver-order.js';
import { MarkInProductionHandler } from './commands/mark-in-production.js';
import { StartProductionHandler } from './commands/start-production.js';
import { MaterialPlanner } from './infra/material-planner.js';
import { GetMaterialCheckHandler } from './queries/get-material-check.js';
import { GetMaterialShortagesHandler } from './queries/get-material-shortages.js';
import { GetOrderDeliveryHandler } from './queries/get-order-delivery.js';
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
    CloseOrderShortHandler,
    CancelSalesOrderHandler,
    MarkInProductionHandler,
    DeliverOrderHandler,
    AdjustDeliveriesHandler,
    ListSalesOrdersHandler,
    GetSalesOrderHandler,
    GetMaterialCheckHandler,
    GetMaterialShortagesHandler,
    GetOrderDeliveryHandler,
  ],
})
export class OrdersModule {}

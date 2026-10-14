import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';
import { GetGateQueueHandler } from './queries/get-gate-queue.js';
import { GetLeakFiguresHandler } from './queries/get-leak-figures.js';
import { GetOrderFiguresHandler } from './queries/get-order-figures.js';
import { GetStockFiguresHandler } from './queries/get-stock-figures.js';
import { GetTodayFiguresHandler } from './queries/get-today-figures.js';

@Module({
  controllers: [DashboardController],
  providers: [
    GetTodayFiguresHandler,
    GetOrderFiguresHandler,
    GetStockFiguresHandler,
    GetLeakFiguresHandler,
    GetGateQueueHandler,
  ],
})
export class DashboardModule {}

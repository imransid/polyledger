import { Controller, Get } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse } from '@nestjs/swagger';
import { Roles } from '../auth/decorators.js';
import { GetGateQueueQuery } from './queries/get-gate-queue.js';
import { GetLeakFiguresQuery } from './queries/get-leak-figures.js';
import { GetOrderFiguresQuery } from './queries/get-order-figures.js';
import { GetStockFiguresQuery } from './queries/get-stock-figures.js';
import { GetTodayFiguresQuery } from './queries/get-today-figures.js';
import {
  gateQueueResponse,
  leakFiguresResponse,
  orderFiguresResponse,
  stockFiguresResponse,
  todayFiguresResponse,
} from './responses.js';
import { DASHBOARD_READERS } from './roles.js';

// One endpoint per card, so a slow card never holds up the others. Dates
// are the factory's: today in Dhaka.
@Roles(...DASHBOARD_READERS)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly queryBus: QueryBus) {}

  /** Today's shifts, and what each machine is doing now. */
  @Get('today')
  @ApiOkResponse({ standardSchema: todayFiguresResponse })
  today() {
    return this.queryBus.execute(new GetTodayFiguresQuery());
  }

  /** Open, late and soon-due sales orders. */
  @Get('orders')
  @ApiOkResponse({ standardSchema: orderFiguresResponse })
  orders() {
    return this.queryBus.execute(new GetOrderFiguresQuery());
  }

  @Get('stock')
  @ApiOkResponse({ standardSchema: stockFiguresResponse })
  stock() {
    return this.queryBus.execute(new GetStockFiguresQuery());
  }

  /** Material lost over the last seven days, today included. */
  @Get('leaks')
  @ApiOkResponse({ standardSchema: leakFiguresResponse })
  leaks() {
    return this.queryBus.execute(new GetLeakFiguresQuery());
  }

  /** Challans waiting for their gate pass, oldest first. */
  @Get('gate')
  @ApiOkResponse({ standardSchema: gateQueueResponse })
  gate() {
    return this.queryBus.execute(new GetGateQueueQuery());
  }
}

import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { factoryToday } from '../../common/dates.js';
import { GetCustomersQuery } from '../../customers/queries/get-customers.js';
import {
  GetOrderOverviewQuery,
  type OrderOverview,
} from '../../orders/queries/get-order-overview.js';
import { daysLate, nextSevenDays } from '../domain/figures.js';

const MOST_LATE_SHOWN = 5;

export interface OrderFigures {
  today: string;
  /** Open orders are due from today to this date. */
  dueBy: string;
  open: OrderOverview['open'];
  lateCount: number;
  mostLate: {
    id: string;
    number: string;
    customerCode: string;
    customerName: string;
    deliveryDate: string;
    daysLate: number;
  }[];
  dueCount: number;
}

export class GetOrderFiguresQuery extends Query<OrderFigures> {}

@QueryHandler(GetOrderFiguresQuery)
export class GetOrderFiguresHandler implements IQueryHandler<GetOrderFiguresQuery> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute(): Promise<OrderFigures> {
    const today = factoryToday();
    const { to: dueBy } = nextSevenDays(today);
    const overview = await this.queryBus.execute(
      new GetOrderOverviewQuery(today, dueBy, MOST_LATE_SHOWN),
    );
    const customers = await this.queryBus.execute(
      new GetCustomersQuery(overview.mostLate.map((order) => order.customerId)),
    );
    const customer = new Map(customers.map((c) => [c.id, c]));
    return {
      today,
      dueBy,
      open: overview.open,
      lateCount: overview.lateCount,
      mostLate: overview.mostLate.map((order) => ({
        id: order.id,
        number: order.number,
        customerCode: customer.get(order.customerId)?.code ?? '',
        customerName: customer.get(order.customerId)?.name ?? '',
        deliveryDate: order.deliveryDate,
        daysLate: daysLate(order.deliveryDate, today),
      })),
      dueCount: overview.dueCount,
    };
  }
}

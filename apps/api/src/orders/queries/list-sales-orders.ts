import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { factoryToday, fromDateString } from '../../common/dates.js';
import {
  type ListQuery,
  type Page,
  pageArgs,
} from '../../common/list-query.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  Prisma,
  SalesOrderStatus,
} from '../../generated/prisma/client.js';
import { OPEN } from '../domain/status.js';
import { type SalesOrderView, toView, withLines } from '../infra/views.js';

export interface SalesOrderFilter extends ListQuery {
  status?: SalesOrderStatus;
  customerId?: string;
  deliveryFrom?: string;
  deliveryTo?: string;
  open?: boolean;
  late?: boolean;
}

export class ListSalesOrdersQuery extends Query<Page<SalesOrderView>> {
  constructor(readonly filter: SalesOrderFilter) {
    super();
  }
}

// Soonest delivery first.
@QueryHandler(ListSalesOrdersQuery)
export class ListSalesOrdersHandler implements IQueryHandler<ListSalesOrdersQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    filter,
  }: ListSalesOrdersQuery): Promise<Page<SalesOrderView>> {
    const contains = { contains: filter.search, mode: 'insensitive' as const };
    const where: Prisma.SalesOrderWhereInput = {
      AND: [
        { status: filter.status, customerId: filter.customerId },
        filter.open ? { status: { in: OPEN } } : {},
        {
          deliveryDate: {
            gte: filter.deliveryFrom && fromDateString(filter.deliveryFrom),
            lte: filter.deliveryTo && fromDateString(filter.deliveryTo),
          },
        },
        // The same rule as isLate, in SQL.
        filter.late
          ? {
              status: { in: OPEN },
              deliveryDate: { lt: fromDateString(factoryToday()) },
            }
          : {},
        filter.search
          ? { OR: [{ number: contains }, { customerPo: contains }] }
          : {},
      ],
    };
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.salesOrder.findMany({
        where,
        include: withLines,
        orderBy: [{ deliveryDate: 'asc' }, { number: 'asc' }],
        ...pageArgs(filter),
      }),
      this.prisma.salesOrder.count({ where }),
    ]);
    return {
      items: orders.map(toView),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }
}

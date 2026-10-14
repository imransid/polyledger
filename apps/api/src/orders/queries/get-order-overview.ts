import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { fromDateString, toDateString } from '../../common/dates.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { OPEN } from '../domain/status.js';

type OpenStatus = 'DRAFT' | 'CONFIRMED' | 'IN_PRODUCTION';

export interface OrderOverview {
  open: Record<OpenStatus, number>;
  lateCount: number;
  /** Those past their delivery date the longest, first. */
  mostLate: {
    id: string;
    number: string;
    customerId: string;
    deliveryDate: string;
  }[];
  /** Open orders due from today to dueBy, both included. */
  dueCount: number;
}

export class GetOrderOverviewQuery extends Query<OrderOverview> {
  constructor(
    readonly today: string,
    readonly dueBy: string,
    readonly mostLateShown: number,
  ) {
    super();
  }
}

@QueryHandler(GetOrderOverviewQuery)
export class GetOrderOverviewHandler implements IQueryHandler<GetOrderOverviewQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    today,
    dueBy,
    mostLateShown,
  }: GetOrderOverviewQuery): Promise<OrderOverview> {
    const open: Prisma.SalesOrderWhereInput = { status: { in: OPEN } };
    // The same rule as isLate, in SQL.
    const late: Prisma.SalesOrderWhereInput = {
      ...open,
      deliveryDate: { lt: fromDateString(today) },
    };
    const [byStatus, lateCount, mostLate, dueCount] = await Promise.all([
      this.prisma.salesOrder.groupBy({
        by: ['status'],
        where: open,
        _count: { _all: true },
      }),
      this.prisma.salesOrder.count({ where: late }),
      this.prisma.salesOrder.findMany({
        where: late,
        select: {
          id: true,
          number: true,
          customerId: true,
          deliveryDate: true,
        },
        orderBy: [{ deliveryDate: 'asc' }, { number: 'asc' }],
        take: mostLateShown,
      }),
      this.prisma.salesOrder.count({
        where: {
          ...open,
          deliveryDate: {
            gte: fromDateString(today),
            lte: fromDateString(dueBy),
          },
        },
      }),
    ]);
    const count = (status: OpenStatus) =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;

    return {
      open: {
        DRAFT: count('DRAFT'),
        CONFIRMED: count('CONFIRMED'),
        IN_PRODUCTION: count('IN_PRODUCTION'),
      },
      lateCount,
      mostLate: mostLate.map((order) => ({
        ...order,
        deliveryDate: toDateString(order.deliveryDate),
      })),
      dueCount,
    };
  }
}

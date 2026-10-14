import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { fromDateString } from '../../common/dates.js';
import {
  type ListQuery,
  type Page,
  pageArgs,
} from '../../common/list-query.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { GatePassStatus, Prisma } from '../../generated/prisma/client.js';
import { type ChallanDetails, describeChallans } from '../infra/details.js';
import { toChallanView, withDetails } from '../infra/views.js';

/** By dispatch date, from and to both included. */
export interface ChallanFilter extends Omit<ListQuery, 'search'> {
  orderId?: string;
  customerId?: string;
  from?: string;
  to?: string;
  gatePass?: GatePassStatus;
}

export class ListChallansQuery extends Query<Page<ChallanDetails>> {
  constructor(readonly filter: ChallanFilter) {
    super();
  }
}

// Newest first.
@QueryHandler(ListChallansQuery)
export class ListChallansHandler implements IQueryHandler<ListChallansQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({ filter }: ListChallansQuery): Promise<Page<ChallanDetails>> {
    const where = whereFor(filter);
    const [challans, total] = await this.prisma.$transaction([
      this.prisma.deliveryChallan.findMany({
        where,
        include: withDetails,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(filter),
      }),
      this.prisma.deliveryChallan.count({ where }),
    ]);
    return {
      items: await describeChallans(this.queryBus, challans.map(toChallanView)),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }
}

function whereFor(filter: ChallanFilter): Prisma.DeliveryChallanWhereInput {
  return {
    orderId: filter.orderId,
    customerId: filter.customerId,
    dispatchedOn: {
      gte: filter.from && fromDateString(filter.from),
      lte: filter.to && fromDateString(filter.to),
    },
    // A reversed challan never left the store, so it waits at no gate.
    ...(filter.gatePass && {
      gatePassStatus: filter.gatePass,
      reversedAt: null,
    }),
  };
}

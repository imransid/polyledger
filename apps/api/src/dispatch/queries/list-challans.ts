import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { fromDateString } from '../../common/dates.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  type ChallanView,
  toChallanView,
  withDetails,
} from '../infra/views.js';

/** A customer's challans by dispatch date, from and to both included. */
export type ChallanFilter =
  | { orderId: string }
  | { customerId: string; from: string; to: string }
  | { gatePassPending: true };

export class ListChallansQuery extends Query<ChallanView[]> {
  constructor(readonly filter: ChallanFilter) {
    super();
  }
}

@QueryHandler(ListChallansQuery)
export class ListChallansHandler implements IQueryHandler<ListChallansQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ filter }: ListChallansQuery): Promise<ChallanView[]> {
    const challans = await this.prisma.deliveryChallan.findMany({
      where: whereFor(filter),
      include: withDetails,
      orderBy: { createdAt: 'asc' },
    });
    return challans.map(toChallanView);
  }
}

function whereFor(filter: ChallanFilter): Prisma.DeliveryChallanWhereInput {
  if ('orderId' in filter) {
    return { orderId: filter.orderId };
  }
  if ('customerId' in filter) {
    return {
      customerId: filter.customerId,
      dispatchedOn: {
        gte: fromDateString(filter.from),
        lte: fromDateString(filter.to),
      },
    };
  }
  return { gatePassStatus: 'PENDING', reversedAt: null };
}

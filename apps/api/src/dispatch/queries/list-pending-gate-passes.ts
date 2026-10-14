import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { type ChallanDetails, describeChallans } from '../infra/details.js';
import { toChallanView, withDetails } from '../infra/views.js';

export class ListPendingGatePassesQuery extends Query<ChallanDetails[]> {}

// Oldest first: the truck that has waited longest.
@QueryHandler(ListPendingGatePassesQuery)
export class ListPendingGatePassesHandler implements IQueryHandler<ListPendingGatePassesQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(): Promise<ChallanDetails[]> {
    const challans = await this.prisma.deliveryChallan.findMany({
      where: { gatePassStatus: 'PENDING', reversedAt: null },
      include: withDetails,
      orderBy: { createdAt: 'asc' },
    });
    return describeChallans(this.queryBus, challans.map(toChallanView));
  }
}

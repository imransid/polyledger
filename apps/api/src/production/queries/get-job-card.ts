import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { GetSalesOrderQuery } from '../../orders/queries/get-sales-order.js';
import { type JobCardView, toJobCardView } from '../infra/job-cards.js';

export type JobCardDetails = JobCardView & {
  /** Shown to everyone who reads the card, operators included. */
  salesOrderNumber: string | null;
};

export class GetJobCardQuery extends Query<JobCardDetails | null> {
  constructor(readonly id: string) {
    super();
  }
}

@QueryHandler(GetJobCardQuery)
export class GetJobCardHandler implements IQueryHandler<GetJobCardQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({ id }: GetJobCardQuery): Promise<JobCardDetails | null> {
    const card = await this.prisma.jobCard.findUnique({ where: { id } });
    if (!card) {
      return null;
    }
    const order = card.salesOrderId
      ? await this.queryBus.execute(new GetSalesOrderQuery(card.salesOrderId))
      : null;
    return { ...toJobCardView(card), salesOrderNumber: order?.number ?? null };
  }
}

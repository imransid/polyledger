import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  type ListQuery,
  type Page,
  pageArgs,
} from '../../common/list-query.js';
import { fromDateString } from '../../common/dates.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobCardStatus } from '../../generated/prisma/client.js';
import { type JobCardView, toJobCardView } from '../infra/job-cards.js';

export interface JobCardFilter extends ListQuery {
  status?: JobCardStatus;
  machineId?: string;
  productId?: string;
  salesOrderId?: string;
  /** Planned start dates, both included. */
  plannedFrom?: string;
  plannedTo?: string;
}

export class ListJobCardsQuery extends Query<Page<JobCardView>> {
  constructor(readonly filter: JobCardFilter) {
    super();
  }
}

@QueryHandler(ListJobCardsQuery)
export class ListJobCardsHandler implements IQueryHandler<ListJobCardsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ filter }: ListJobCardsQuery): Promise<Page<JobCardView>> {
    const where = {
      status: filter.status,
      machineId: filter.machineId,
      productId: filter.productId,
      salesOrderId: filter.salesOrderId,
      plannedStartDate: {
        gte: filter.plannedFrom
          ? fromDateString(filter.plannedFrom)
          : undefined,
        lte: filter.plannedTo ? fromDateString(filter.plannedTo) : undefined,
      },
      ...(filter.search && {
        number: { contains: filter.search, mode: 'insensitive' as const },
      }),
    };
    const [cards, total] = await this.prisma.$transaction([
      this.prisma.jobCard.findMany({
        where,
        orderBy: [{ plannedStartDate: 'asc' }, { number: 'asc' }],
        ...pageArgs(filter),
      }),
      this.prisma.jobCard.count({ where }),
    ]);
    return {
      items: cards.map(toJobCardView),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }
}

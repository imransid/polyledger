import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { addDays, factoryDayStart } from '../../common/dates.js';
import {
  type ListQuery,
  type Page,
  pageArgs,
} from '../../common/list-query.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  StockDocument,
  StockDocumentKind,
} from '../../generated/prisma/client.js';
import { type Described, describe } from '../infra/document-views.js';

export interface StockDocumentFilter extends ListQuery {
  kind?: StockDocumentKind;
  jobCardId?: string;
  /** Factory dates the document was posted on, both included. */
  from?: string;
  to?: string;
}

export class ListStockDocumentsQuery extends Query<
  Page<Described<StockDocument>>
> {
  constructor(readonly filter: StockDocumentFilter) {
    super();
  }
}

@QueryHandler(ListStockDocumentsQuery)
export class ListStockDocumentsHandler implements IQueryHandler<ListStockDocumentsQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({
    filter,
  }: ListStockDocumentsQuery): Promise<Page<Described<StockDocument>>> {
    const where = {
      kind: filter.kind,
      jobCardId: filter.jobCardId,
      postedAt: {
        gte: filter.from ? factoryDayStart(filter.from) : undefined,
        lt: filter.to ? factoryDayStart(addDays(filter.to, 1)) : undefined,
      },
      ...(filter.search && {
        OR: [
          { number: { contains: filter.search, mode: 'insensitive' as const } },
          {
            supplierReference: {
              contains: filter.search,
              mode: 'insensitive' as const,
            },
          },
        ],
      }),
    };
    const [documents, total] = await this.prisma.$transaction([
      this.prisma.stockDocument.findMany({
        where,
        orderBy: { postedAt: 'desc' },
        ...pageArgs(filter),
      }),
      this.prisma.stockDocument.count({ where }),
    ]);
    return {
      items: await describe(this.queryBus, documents),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }
}

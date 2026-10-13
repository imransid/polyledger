import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
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

export interface StockDocumentFilter extends ListQuery {
  kind?: StockDocumentKind;
}

export class ListStockDocumentsQuery extends Query<Page<StockDocument>> {
  constructor(readonly filter: StockDocumentFilter) {
    super();
  }
}

@QueryHandler(ListStockDocumentsQuery)
export class ListStockDocumentsHandler implements IQueryHandler<ListStockDocumentsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    filter,
  }: ListStockDocumentsQuery): Promise<Page<StockDocument>> {
    const where = {
      kind: filter.kind,
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
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stockDocument.findMany({
        where,
        orderBy: { postedAt: 'desc' },
        ...pageArgs(filter),
      }),
      this.prisma.stockDocument.count({ where }),
    ]);
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }
}

import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { withEntries } from '../infra/ledger.js';

export type StockDocumentView = Prisma.StockDocumentGetPayload<{
  include: typeof withEntries;
}>;

export class GetStockDocumentQuery extends Query<StockDocumentView | null> {
  constructor(readonly id: string) {
    super();
  }
}

@QueryHandler(GetStockDocumentQuery)
export class GetStockDocumentHandler implements IQueryHandler<GetStockDocumentQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ id }: GetStockDocumentQuery): Promise<StockDocumentView | null> {
    return this.prisma.stockDocument.findUnique({
      where: { id },
      include: withEntries,
    });
  }
}

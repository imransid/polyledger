import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { type Described, describe } from '../infra/document-views.js';
import { withEntries } from '../infra/ledger.js';

export type StockDocumentView = Prisma.StockDocumentGetPayload<{
  include: typeof withEntries;
}>;

export class GetStockDocumentQuery extends Query<Described<StockDocumentView> | null> {
  constructor(readonly id: string) {
    super();
  }
}

@QueryHandler(GetStockDocumentQuery)
export class GetStockDocumentHandler implements IQueryHandler<GetStockDocumentQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({
    id,
  }: GetStockDocumentQuery): Promise<Described<StockDocumentView> | null> {
    const document = await this.prisma.stockDocument.findUnique({
      where: { id },
      include: withEntries,
    });
    if (!document) {
      return null;
    }
    const [described] = await describe(this.queryBus, [document]);
    return described;
  }
}

import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { toSafeNumber } from '../../common/quantities.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  StockDocumentKind,
  StockItemType,
} from '../../generated/prisma/client.js';

export interface JobCardStockLine {
  kind: StockDocumentKind;
  itemType: StockItemType;
  itemId: string;
  grams: number;
  pieces: number;
}

// Net movement at the job card's floor location per document kind and
// item. Reversal rows count under the kind they reverse, so they net out.
export class GetJobCardStockQuery extends Query<JobCardStockLine[]> {
  constructor(
    readonly jobCardId: string,
    readonly floorLocationId: string,
  ) {
    super();
  }
}

@QueryHandler(GetJobCardStockQuery)
export class GetJobCardStockHandler implements IQueryHandler<GetJobCardStockQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    jobCardId,
    floorLocationId,
  }: GetJobCardStockQuery): Promise<JobCardStockLine[]> {
    const rows = await this.prisma.$queryRaw<
      {
        kind: StockDocumentKind;
        itemType: StockItemType;
        itemId: string;
        grams: bigint;
        pieces: bigint;
      }[]
    >`
      SELECT COALESCE(original.movement_type, l.movement_type) AS kind,
             l.item_type AS "itemType", l.item_id AS "itemId",
             SUM(l.grams)::bigint AS grams,
             SUM(COALESCE(l.pieces, 0))::bigint AS pieces
      FROM stock_ledger l
      JOIN stock_documents d ON d.id = l.document_id
      LEFT JOIN stock_ledger original ON original.id = l.reversal_of_id
      WHERE d.job_card_id = ${jobCardId}::uuid
        AND l.location_id = ${floorLocationId}::uuid
      GROUP BY 1, 2, 3`;
    return rows.map((row) => ({
      ...row,
      grams: toSafeNumber(row.grams),
      pieces: toSafeNumber(row.pieces),
    }));
  }
}

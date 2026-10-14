import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { grams, type Grams } from '@polyledger/shared';
import {
  type ListQuery,
  type Page,
  pageArgs,
} from '../../common/list-query.js';
import { toSafeNumber } from '../../common/quantities.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  StockDocumentKind,
  StockItemType,
} from '../../generated/prisma/client.js';

export interface StockCardFilter extends ListQuery {
  itemType: StockItemType;
  itemId: string;
  locationId?: string;
}

export interface StockCardLine {
  entryId: number;
  postedAt: Date;
  movementType: StockDocumentKind;
  documentId: string;
  documentNumber: string;
  locationId: string;
  grams: Grams;
  pieces: number | null;
  balanceGrams: Grams;
  balancePieces: number | null;
}

interface CardRow {
  entryId: number;
  postedAt: Date;
  movementType: StockDocumentKind;
  documentId: string;
  documentNumber: string;
  locationId: string;
  grams: number;
  pieces: number | null;
  balanceGrams: bigint;
  balancePieces: bigint;
}

export class GetStockCardQuery extends Query<Page<StockCardLine>> {
  constructor(readonly filter: StockCardFilter) {
    super();
  }
}

// Newest first, each line with the balance right after it. The running
// balance is summed over the whole history in SQL, before paging.
@QueryHandler(GetStockCardQuery)
export class GetStockCardHandler implements IQueryHandler<GetStockCardQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ filter }: GetStockCardQuery): Promise<Page<StockCardLine>> {
    const { itemType, itemId } = filter;
    const locationId = filter.locationId ?? null;
    const { skip, take } = pageArgs(filter);

    const rows = await this.prisma.$queryRaw<CardRow[]>`
      SELECT * FROM (
        SELECT l.id AS "entryId", l.posted_at AS "postedAt",
               l.movement_type AS "movementType", d.id AS "documentId",
               d.number AS "documentNumber",
               l.location_id AS "locationId", l.grams, l.pieces,
               SUM(l.grams::bigint) OVER (ORDER BY l.id) AS "balanceGrams",
               SUM(COALESCE(l.pieces, 0)::bigint) OVER (ORDER BY l.id) AS "balancePieces"
        FROM stock_ledger l
        JOIN stock_documents d ON d.id = l.document_id
        WHERE l.item_type = ${itemType}::"StockItemType"
          AND l.item_id = ${itemId}::uuid
          AND (${locationId}::uuid IS NULL OR l.location_id = ${locationId}::uuid)
      ) card
      ORDER BY "entryId" DESC
      LIMIT ${take} OFFSET ${skip}`;
    const total = await this.prisma.stockLedgerEntry.count({
      where: { itemType, itemId, locationId: filter.locationId },
    });

    const isProduct = itemType === 'PRODUCT';
    const items = rows.map((row) => ({
      ...row,
      grams: grams(row.grams),
      balanceGrams: grams(Number(row.balanceGrams)),
      balancePieces: isProduct ? toSafeNumber(row.balancePieces) : null,
    }));
    return { items, total, page: filter.page, pageSize: filter.pageSize };
  }
}

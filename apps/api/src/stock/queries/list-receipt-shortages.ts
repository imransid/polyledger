import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { grams, type Grams } from '@polyledger/shared';
import { PrismaService } from '../../database/prisma.service.js';

export interface ShortageFilter {
  supplierId?: string;
  from?: string;
  to?: string;
}

export interface ShortageLine {
  documentId: string;
  documentNumber: string;
  receivedOn: string;
  supplierId: string;
  supplierReference: string;
  rawMaterialId: string;
  challanGrams: Grams;
  receivedGrams: Grams;
  shortGrams: Grams;
}

interface ShortageRow extends Omit<ShortageLine, 'receivedOn'> {
  receivedOn: Date;
  totalShortGrams: bigint;
}

export class ListReceiptShortagesQuery extends Query<{
  items: ShortageLine[];
  totalShortGrams: Grams;
}> {
  constructor(readonly filter: ShortageFilter) {
    super();
  }
}

// Lines where the supplier billed more than our scale showed. Reversed
// receipts are left out.
@QueryHandler(ListReceiptShortagesQuery)
export class ListReceiptShortagesHandler implements IQueryHandler<ListReceiptShortagesQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ filter }: ListReceiptShortagesQuery) {
    const supplierId = filter.supplierId ?? null;
    const from = filter.from ?? null;
    const to = filter.to ?? null;

    const rows = await this.prisma.$queryRaw<ShortageRow[]>`
      SELECT d.id AS "documentId", d.number AS "documentNumber",
             d.received_on AS "receivedOn", d.supplier_id AS "supplierId",
             d.supplier_reference AS "supplierReference",
             r.raw_material_id AS "rawMaterialId",
             r.challan_grams AS "challanGrams",
             r.received_grams AS "receivedGrams",
             r.challan_grams - r.received_grams AS "shortGrams",
             SUM((r.challan_grams - r.received_grams)::bigint) OVER () AS "totalShortGrams"
      FROM receipt_lines r
      JOIN stock_documents d ON d.id = r.document_id
      WHERE d.reversed_at IS NULL
        AND r.challan_grams > r.received_grams
        AND (${supplierId}::uuid IS NULL OR d.supplier_id = ${supplierId}::uuid)
        AND (${from}::date IS NULL OR d.received_on >= ${from}::date)
        AND (${to}::date IS NULL OR d.received_on <= ${to}::date)
      ORDER BY d.received_on, d.number, r.raw_material_id`;

    return {
      items: rows.map(({ totalShortGrams: _total, ...row }) => ({
        ...row,
        receivedOn: row.receivedOn.toISOString().slice(0, 10),
        challanGrams: grams(row.challanGrams),
        receivedGrams: grams(row.receivedGrams),
        shortGrams: grams(row.shortGrams),
      })),
      totalShortGrams: grams(Number(rows[0]?.totalShortGrams ?? 0n)),
    };
  }
}

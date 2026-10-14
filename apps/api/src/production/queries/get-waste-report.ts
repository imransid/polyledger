import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { basisPointsOf, toSafeNumber } from '../../common/quantities.js';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma, type WasteType } from '../../generated/prisma/client.js';
import { GetMachineQuery } from '../../machines/queries/get-machine.js';
import { GetMouldQuery } from '../../moulds/queries/get-mould.js';
import { GetProductsQuery } from '../../products/queries/get-products.js';

export const WASTE_REPORT_GROUPS = [
  'machine',
  'mould',
  'product',
  'shift',
] as const;

export type WasteReportGroup = (typeof WASTE_REPORT_GROUPS)[number];

export interface WasteReportRow {
  /** The machine, mould or product id, or the shift. */
  key: string;
  /** The machine, mould or product code, or the shift. */
  label: string;
  runnerGrams: number;
  rejectGrams: number;
  purgeGrams: number;
  sweepingsGrams: number;
  wasteGrams: number;
  /** Pieces and runners by backflush, plus purge and sweepings. */
  materialUsedGrams: number;
  /** Weighed waste out of material used: 2.35% is 235. */
  wasteBasisPoints: number | null;
}

const WASTE_FIELDS: Record<
  WasteType,
  'runnerGrams' | 'rejectGrams' | 'purgeGrams' | 'sweepingsGrams'
> = {
  RUNNER: 'runnerGrams',
  REJECT: 'rejectGrams',
  PURGE: 'purgeGrams',
  SWEEPINGS: 'sweepingsGrams',
};

/** Shift dates from and to, both included. */
export class GetWasteReportQuery extends Query<WasteReportRow[]> {
  constructor(
    readonly groupBy: WasteReportGroup,
    readonly from: string,
    readonly to: string,
  ) {
    super();
  }
}

@QueryHandler(GetWasteReportQuery)
export class GetWasteReportHandler implements IQueryHandler<GetWasteReportQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({
    groupBy,
    from,
    to,
  }: GetWasteReportQuery): Promise<WasteReportRow[]> {
    // Both queries below alias the entry as e and its job card as j.
    const groupKey = Prisma.sql`CASE ${groupBy}::text
      WHEN 'machine' THEN j.machine_id::text
      WHEN 'mould' THEN j.mould_id::text
      WHEN 'product' THEN j.product_id::text
      ELSE e.shift::text END`;
    const [backflushed, weighed] = await Promise.all([
      this.prisma.$queryRaw<{ key: string; grams: bigint }[]>`
        SELECT ${groupKey} AS key,
               SUM(m.piece_grams::bigint + m.runner_grams)::bigint AS grams
        FROM production_entries e
        JOIN production_entry_materials m ON m.entry_id = e.id
        JOIN job_cards j ON j.id = e.job_card_id
        WHERE e.reversed_at IS NULL
          AND e.shift_date BETWEEN ${from}::date AND ${to}::date
        GROUP BY 1`,
      this.prisma.$queryRaw<
        { key: string; wasteType: WasteType; grams: bigint }[]
      >`
        SELECT ${groupKey} AS key, l.waste_type AS "wasteType",
               SUM(l.grams)::bigint AS grams
        FROM waste_entries e
        JOIN waste_entry_lines l ON l.entry_id = e.id
        JOIN job_cards j ON j.id = e.job_card_id
        WHERE e.reversed_at IS NULL
          AND e.shift_date BETWEEN ${from}::date AND ${to}::date
        GROUP BY 1, 2`,
    ]);

    const rows = new Map<string, WasteReportRow>();
    const rowFor = (key: string) => {
      const row = rows.get(key) ?? {
        key,
        label: key,
        runnerGrams: 0,
        rejectGrams: 0,
        purgeGrams: 0,
        sweepingsGrams: 0,
        wasteGrams: 0,
        materialUsedGrams: 0,
        wasteBasisPoints: null,
      };
      rows.set(key, row);
      return row;
    };
    for (const { key, grams } of backflushed) {
      rowFor(key).materialUsedGrams += toSafeNumber(grams);
    }
    for (const { key, wasteType, grams } of weighed) {
      const row = rowFor(key);
      const weight = toSafeNumber(grams);
      row[WASTE_FIELDS[wasteType]] += weight;
      row.wasteGrams += weight;
      if (wasteType === 'PURGE' || wasteType === 'SWEEPINGS') {
        row.materialUsedGrams += weight;
      }
    }

    const labels = await this.labels(groupBy, [...rows.keys()]);
    return [...rows.values()]
      .map((row) => ({
        ...row,
        label: labels.get(row.key) ?? row.key,
        wasteBasisPoints: basisPointsOf(row.wasteGrams, row.materialUsedGrams),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  private async labels(
    groupBy: WasteReportGroup,
    ids: string[],
  ): Promise<Map<string, string>> {
    if (groupBy === 'shift') {
      return new Map();
    }
    if (groupBy === 'product') {
      const products = await this.queryBus.execute(new GetProductsQuery(ids));
      return new Map(products.map((product) => [product.id, product.code]));
    }
    const found = await Promise.all(
      ids.map((id) =>
        groupBy === 'machine'
          ? this.queryBus.execute(new GetMachineQuery(id))
          : this.queryBus.execute(new GetMouldQuery(id)),
      ),
    );
    return new Map(found.map((item) => [item!.id, item!.code]));
  }
}

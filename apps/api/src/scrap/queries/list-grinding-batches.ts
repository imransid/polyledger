import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { fromDateString } from '../../common/dates.js';
import { basisPointsOf, toSafeNumber } from '../../common/quantities.js';
import { PrismaService } from '../../database/prisma.service.js';
import { type GrindingBatchView, toGrindingBatchView } from '../infra/views.js';

export interface GrindingReport {
  /** Batches that are not reversed. */
  totals: {
    batches: number;
    inputGrams: number;
    outputGrams: number;
    lossGrams: number;
    /** Loss out of input: 2.35% is 235. */
    lossBasisPoints: number | null;
  };
  batches: GrindingBatchView[];
}

/** By the day ground, from and to both included. */
export class ListGrindingBatchesQuery extends Query<GrindingReport> {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super();
  }
}

@QueryHandler(ListGrindingBatchesQuery)
export class ListGrindingBatchesHandler implements IQueryHandler<ListGrindingBatchesQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    from,
    to,
  }: ListGrindingBatchesQuery): Promise<GrindingReport> {
    const [batches, [totals]] = await Promise.all([
      this.prisma.grindingBatch.findMany({
        where: {
          groundOn: { gte: fromDateString(from), lte: fromDateString(to) },
        },
        orderBy: [{ groundOn: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.$queryRaw<
        { batches: bigint; inputGrams: bigint; outputGrams: bigint }[]
      >`
        SELECT COUNT(*)::bigint AS batches,
               COALESCE(SUM(input_grams), 0)::bigint AS "inputGrams",
               COALESCE(SUM(output_grams), 0)::bigint AS "outputGrams"
        FROM grinding_batches
        WHERE reversed_at IS NULL
          AND ground_on BETWEEN ${from}::date AND ${to}::date`,
    ]);

    const inputGrams = toSafeNumber(totals.inputGrams);
    const lossGrams = inputGrams - toSafeNumber(totals.outputGrams);
    return {
      totals: {
        batches: toSafeNumber(totals.batches),
        inputGrams,
        outputGrams: toSafeNumber(totals.outputGrams),
        lossGrams,
        lossBasisPoints: basisPointsOf(lossGrams, inputGrams),
      },
      batches: batches.map(toGrindingBatchView),
    };
  }
}

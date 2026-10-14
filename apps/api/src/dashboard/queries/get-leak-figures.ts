import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { factoryDayStart, factoryToday } from '../../common/dates.js';
import { GetWasteReportQuery } from '../../production/queries/get-waste-report.js';
import { ListMaterialDifferencesQuery } from '../../production/queries/list-material-differences.js';
import { GetProductsQuery } from '../../products/queries/get-products.js';
import { ListGrindingBatchesQuery } from '../../scrap/queries/list-grinding-batches.js';
import { ListReceiptShortagesQuery } from '../../stock/queries/list-receipt-shortages.js';
import {
  daysOf,
  lastSevenDays,
  shareOfIssued,
  worstFirst,
} from '../domain/figures.js';

const WORST_SHOWN = 5;

export interface LeakFigures {
  from: string;
  to: string;
  closedJobCards: number;
  /** Over every job card closed in the range; signed. */
  differenceGrams: number;
  worstJobCards: {
    jobCardId: string;
    number: string;
    productCode: string;
    issuedGrams: number;
    differenceGrams: number;
    /** Signed share of what was issued: −1.25% is −125. */
    differenceBasisPoints: number | null;
  }[];
  /** Every day of the range, oldest first, with or without production. */
  wasteByDay: {
    day: string;
    wasteGrams: number;
    materialUsedGrams: number;
    wasteBasisPoints: number | null;
  }[];
  shortageGrams: number;
  grindingLossGrams: number;
}

// Where material went that no product accounts for, over the last seven
// factory days.
export class GetLeakFiguresQuery extends Query<LeakFigures> {}

@QueryHandler(GetLeakFiguresQuery)
export class GetLeakFiguresHandler implements IQueryHandler<GetLeakFiguresQuery> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute(): Promise<LeakFigures> {
    const range = lastSevenDays(factoryToday());
    const [cards, waste, shortages, grinding] = await Promise.all([
      this.queryBus.execute(
        new ListMaterialDifferencesQuery(factoryDayStart(range.from)),
      ),
      this.queryBus.execute(
        new GetWasteReportQuery('day', range.from, range.to),
      ),
      this.queryBus.execute(new ListReceiptShortagesQuery(range)),
      this.queryBus.execute(new ListGrindingBatchesQuery(range.from, range.to)),
    ]);
    const worst = [...cards].sort(worstFirst).slice(0, WORST_SHOWN);
    const products = await this.queryBus.execute(
      new GetProductsQuery(worst.map((card) => card.productId)),
    );
    const productCode = new Map(products.map((p) => [p.id, p.code]));
    const wasteOn = new Map(waste.map((row) => [row.key, row]));

    return {
      ...range,
      closedJobCards: cards.length,
      differenceGrams: cards.reduce(
        (sum, card) => sum + card.differenceGrams,
        0,
      ),
      worstJobCards: worst.map((card) => ({
        jobCardId: card.jobCardId,
        number: card.number,
        productCode: productCode.get(card.productId) ?? '',
        issuedGrams: card.issuedGrams,
        differenceGrams: card.differenceGrams,
        differenceBasisPoints: shareOfIssued(
          card.differenceGrams,
          card.issuedGrams,
        ),
      })),
      wasteByDay: daysOf(range).map((day) => ({
        day,
        wasteGrams: wasteOn.get(day)?.wasteGrams ?? 0,
        materialUsedGrams: wasteOn.get(day)?.materialUsedGrams ?? 0,
        wasteBasisPoints: wasteOn.get(day)?.wasteBasisPoints ?? null,
      })),
      shortageGrams: shortages.totalShortGrams,
      grindingLossGrams: grinding.totals.lossGrams,
    };
  }
}

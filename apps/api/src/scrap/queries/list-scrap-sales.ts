import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { fromDateString } from '../../common/dates.js';
import { toSafeNumber } from '../../common/quantities.js';
import { PrismaService } from '../../database/prisma.service.js';
import { type ScrapSaleView, toScrapSaleView } from '../infra/views.js';

export interface ScrapSalesReport {
  /** Sales that are not reversed. */
  totals: { sales: number; grams: number; amountPoisha: number };
  sales: ScrapSaleView[];
}

/** By the day sold, from and to both included. */
export class ListScrapSalesQuery extends Query<ScrapSalesReport> {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super();
  }
}

@QueryHandler(ListScrapSalesQuery)
export class ListScrapSalesHandler implements IQueryHandler<ListScrapSalesQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ from, to }: ListScrapSalesQuery): Promise<ScrapSalesReport> {
    const [sales, [totals]] = await Promise.all([
      this.prisma.scrapSale.findMany({
        where: {
          soldOn: { gte: fromDateString(from), lte: fromDateString(to) },
        },
        include: { lines: { orderBy: { lineNo: 'asc' } } },
        orderBy: [{ soldOn: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.$queryRaw<
        { sales: bigint; grams: bigint; amountPoisha: bigint }[]
      >`
        SELECT COUNT(DISTINCT s.id)::bigint AS sales,
               COALESCE(SUM(l.grams), 0)::bigint AS grams,
               COALESCE(SUM(l.amount_poisha), 0)::bigint AS "amountPoisha"
        FROM scrap_sales s
        JOIN scrap_sale_lines l ON l.sale_id = s.id
        WHERE s.reversed_at IS NULL
          AND s.sold_on BETWEEN ${from}::date AND ${to}::date`,
    ]);

    return {
      totals: {
        sales: toSafeNumber(totals.sales),
        grams: toSafeNumber(totals.grams),
        amountPoisha: toSafeNumber(totals.amountPoisha),
      },
      sales: sales.map(toScrapSaleView),
    };
  }
}

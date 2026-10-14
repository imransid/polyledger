import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { JobCardReporter } from '../infra/job-card-reporter.js';

export interface MaterialDifference {
  jobCardId: string;
  number: string;
  productId: string;
  issuedGrams: number;
  /** Issued but neither used nor returned, over all its materials. */
  differenceGrams: number;
}

/** Job cards closed at or after `since`, with their unexplained material. */
export class ListMaterialDifferencesQuery extends Query<MaterialDifference[]> {
  constructor(readonly since: Date) {
    super();
  }
}

@QueryHandler(ListMaterialDifferencesQuery)
export class ListMaterialDifferencesHandler implements IQueryHandler<ListMaterialDifferencesQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reporter: JobCardReporter,
  ) {}

  async execute({
    since,
  }: ListMaterialDifferencesQuery): Promise<MaterialDifference[]> {
    const cards = await this.prisma.jobCard.findMany({
      where: { status: 'CLOSED', closedAt: { gte: since } },
      orderBy: { closedAt: 'asc' },
    });
    return Promise.all(
      cards.map(async (card) => {
        const { materials } = await this.reporter.summary(card);
        return {
          jobCardId: card.id,
          number: card.number,
          productId: card.productId,
          issuedGrams: sum(materials.map((m) => m.issuedGrams)),
          differenceGrams: sum(materials.map((m) => m.differenceGrams)),
        };
      }),
    );
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

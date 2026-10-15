import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { type JobCardView, toJobCardView } from '../infra/job-cards.js';

/** A floor's job cards changed at or after `since`, in any status; all of them without it. */
export class ListChangedJobCardsQuery extends Query<JobCardView[]> {
  constructor(
    readonly floorLocationId: string,
    readonly since: Date | null,
  ) {
    super();
  }
}

@QueryHandler(ListChangedJobCardsQuery)
export class ListChangedJobCardsHandler implements IQueryHandler<ListChangedJobCardsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    floorLocationId,
    since,
  }: ListChangedJobCardsQuery): Promise<JobCardView[]> {
    const cards = await this.prisma.jobCard.findMany({
      where: {
        floorLocationId,
        ...(since && { updatedAt: { gte: since } }),
      },
    });
    return cards.map(toJobCardView);
  }
}

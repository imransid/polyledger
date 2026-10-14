import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { type EntryView, toEntryView } from '../infra/job-cards.js';

export class ListProductionEntriesQuery extends Query<EntryView[]> {
  constructor(readonly jobCardId: string) {
    super();
  }
}

@QueryHandler(ListProductionEntriesQuery)
export class ListProductionEntriesHandler implements IQueryHandler<ListProductionEntriesQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    jobCardId,
  }: ListProductionEntriesQuery): Promise<EntryView[]> {
    const entries = await this.prisma.productionEntry.findMany({
      where: { jobCardId },
      include: { materials: true },
      orderBy: [{ shiftDate: 'asc' }, { shift: 'asc' }, { createdAt: 'asc' }],
    });
    return entries.map(toEntryView);
  }
}

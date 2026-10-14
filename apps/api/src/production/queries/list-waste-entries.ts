import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import {
  toWasteEntryView,
  type WasteEntryView,
} from '../infra/waste-entries.js';

export class ListWasteEntriesQuery extends Query<WasteEntryView[]> {
  constructor(readonly jobCardId: string) {
    super();
  }
}

@QueryHandler(ListWasteEntriesQuery)
export class ListWasteEntriesHandler implements IQueryHandler<ListWasteEntriesQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    jobCardId,
  }: ListWasteEntriesQuery): Promise<WasteEntryView[]> {
    const entries = await this.prisma.wasteEntry.findMany({
      where: { jobCardId },
      include: { lines: true },
      orderBy: [{ shiftDate: 'asc' }, { shift: 'asc' }, { createdAt: 'asc' }],
    });
    return entries.map(toWasteEntryView);
  }
}

import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { entryWarnings } from '../domain/entry-warnings.js';
import { type EntryView, toEntryView } from '../infra/job-cards.js';

export type ListedEntry = EntryView & { warnings: string[] };

export class ListProductionEntriesQuery extends Query<ListedEntry[]> {
  constructor(readonly jobCardId: string) {
    super();
  }
}

// Each entry with the warnings it had when recorded: shots against pieces,
// and the shot counter against the previous shift on the same machine.
@QueryHandler(ListProductionEntriesQuery)
export class ListProductionEntriesHandler implements IQueryHandler<ListProductionEntriesQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    jobCardId,
  }: ListProductionEntriesQuery): Promise<ListedEntry[]> {
    const [card, entries, previous] = await Promise.all([
      this.prisma.jobCard.findUnique({ where: { id: jobCardId } }),
      this.prisma.productionEntry.findMany({
        where: { jobCardId },
        include: { materials: true },
        orderBy: [{ shiftDate: 'asc' }, { shift: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.$queryRaw<{ id: string; shotEnd: number | null }[]>`
        SELECT e.id,
               (SELECT p.shot_end
                FROM production_entries p
                JOIN job_cards pj ON pj.id = p.job_card_id
                WHERE pj.machine_id = j.machine_id
                  AND p.reversed_at IS NULL
                  AND (p.shift_date, p.shift) < (e.shift_date, e.shift)
                ORDER BY p.shift_date DESC, p.shift DESC
                LIMIT 1) AS "shotEnd"
        FROM production_entries e
        JOIN job_cards j ON j.id = e.job_card_id
        WHERE e.job_card_id = ${jobCardId}::uuid`,
    ]);
    if (!card) {
      return [];
    }
    const previousShotEnd = new Map(
      previous.map((row) => [row.id, row.shotEnd]),
    );
    return entries.map((entry) => ({
      ...toEntryView(entry),
      warnings: entry.reversedAt
        ? []
        : entryWarnings(
            entry,
            card.cavities,
            previousShotEnd.get(entry.id) ?? null,
          ),
    }));
  }
}

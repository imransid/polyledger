import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { toSafeNumber } from '../../common/quantities.js';
import { PrismaService } from '../../database/prisma.service.js';

export interface DayOutput {
  goodPieces: number;
  rejectedPieces: number;
}

/** Pieces from the shifts of one factory date, on every machine. */
export class GetDayOutputQuery extends Query<DayOutput> {
  constructor(readonly day: string) {
    super();
  }
}

@QueryHandler(GetDayOutputQuery)
export class GetDayOutputHandler implements IQueryHandler<GetDayOutputQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ day }: GetDayOutputQuery): Promise<DayOutput> {
    const [made] = await this.prisma.$queryRaw<
      { good: bigint; rejected: bigint }[]
    >`
      SELECT COALESCE(SUM(good_pieces), 0)::bigint AS good,
             COALESCE(SUM(rejected_pieces), 0)::bigint AS rejected
      FROM production_entries
      WHERE reversed_at IS NULL AND shift_date = ${day}::date`;
    return {
      goodPieces: toSafeNumber(made.good),
      rejectedPieces: toSafeNumber(made.rejected),
    };
  }
}

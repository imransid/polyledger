import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobCardSummary } from '../domain/summary.js';
import { JobCardReporter } from '../infra/job-card-reporter.js';

export class GetJobCardSummaryQuery extends Query<JobCardSummary | null> {
  constructor(readonly jobCardId: string) {
    super();
  }
}

@QueryHandler(GetJobCardSummaryQuery)
export class GetJobCardSummaryHandler implements IQueryHandler<GetJobCardSummaryQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reporter: JobCardReporter,
  ) {}

  async execute({
    jobCardId,
  }: GetJobCardSummaryQuery): Promise<JobCardSummary | null> {
    const card = await this.prisma.jobCard.findUnique({
      where: { id: jobCardId },
    });
    return card && this.reporter.summary(card);
  }
}

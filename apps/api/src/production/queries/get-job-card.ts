import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { type JobCardView, toJobCardView } from '../infra/job-cards.js';

export class GetJobCardQuery extends Query<JobCardView | null> {
  constructor(readonly id: string) {
    super();
  }
}

@QueryHandler(GetJobCardQuery)
export class GetJobCardHandler implements IQueryHandler<GetJobCardQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ id }: GetJobCardQuery): Promise<JobCardView | null> {
    const card = await this.prisma.jobCard.findUnique({ where: { id } });
    return card && toJobCardView(card);
  }
}

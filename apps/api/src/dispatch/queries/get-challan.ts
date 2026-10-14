import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { type ChallanDetails, describeChallans } from '../infra/details.js';
import { toChallanView, withDetails } from '../infra/views.js';

export class GetChallanQuery extends Query<ChallanDetails | null> {
  constructor(readonly id: string) {
    super();
  }
}

@QueryHandler(GetChallanQuery)
export class GetChallanHandler implements IQueryHandler<GetChallanQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({ id }: GetChallanQuery): Promise<ChallanDetails | null> {
    const challan = await this.prisma.deliveryChallan.findUnique({
      where: { id },
      include: withDetails,
    });
    if (!challan) {
      return null;
    }
    const [details] = await describeChallans(this.queryBus, [
      toChallanView(challan),
    ]);
    return details;
  }
}

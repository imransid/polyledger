import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { type SalesOrderView, toView, withLines } from '../infra/views.js';

export class GetSalesOrdersQuery extends Query<SalesOrderView[]> {
  constructor(readonly ids: string[]) {
    super();
  }
}

@QueryHandler(GetSalesOrdersQuery)
export class GetSalesOrdersHandler implements IQueryHandler<GetSalesOrdersQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ ids }: GetSalesOrdersQuery): Promise<SalesOrderView[]> {
    const orders = await this.prisma.salesOrder.findMany({
      where: { id: { in: ids } },
      include: withLines,
    });
    return orders.map(toView);
  }
}

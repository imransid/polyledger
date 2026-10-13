import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { type SalesOrderView, toView, withLines } from '../infra/views.js';

export class GetSalesOrderQuery extends Query<SalesOrderView | null> {
  constructor(readonly id: string) {
    super();
  }
}

@QueryHandler(GetSalesOrderQuery)
export class GetSalesOrderHandler implements IQueryHandler<GetSalesOrderQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ id }: GetSalesOrderQuery): Promise<SalesOrderView | null> {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id },
      include: withLines,
    });
    return order && toView(order);
  }
}

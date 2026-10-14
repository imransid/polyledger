import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Customer } from '../../generated/prisma/client.js';

export class GetCustomersQuery extends Query<Customer[]> {
  constructor(readonly ids: string[]) {
    super();
  }
}

@QueryHandler(GetCustomersQuery)
export class GetCustomersHandler implements IQueryHandler<GetCustomersQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ ids }: GetCustomersQuery): Promise<Customer[]> {
    return this.prisma.customer.findMany({ where: { id: { in: ids } } });
  }
}

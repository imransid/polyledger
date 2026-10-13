import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Customer } from '../../generated/prisma/client.js';

export class GetCustomerQuery extends Query<Customer | null> {
  constructor(readonly id: string) {
    super();
  }
}

@QueryHandler(GetCustomerQuery)
export class GetCustomerHandler implements IQueryHandler<GetCustomerQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ id }: GetCustomerQuery): Promise<Customer | null> {
    return this.prisma.customer.findUnique({ where: { id } });
  }
}

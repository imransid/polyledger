import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Supplier } from '../../generated/prisma/client.js';

export class GetSupplierQuery extends Query<Supplier | null> {
  constructor(readonly id: string) {
    super();
  }
}

@QueryHandler(GetSupplierQuery)
export class GetSupplierHandler implements IQueryHandler<GetSupplierQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ id }: GetSupplierQuery): Promise<Supplier | null> {
    return this.prisma.supplier.findUnique({ where: { id } });
  }
}

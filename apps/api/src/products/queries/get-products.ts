import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Product } from '../../generated/prisma/client.js';

export class GetProductsQuery extends Query<Product[]> {
  constructor(readonly ids: string[]) {
    super();
  }
}

@QueryHandler(GetProductsQuery)
export class GetProductsHandler implements IQueryHandler<GetProductsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ ids }: GetProductsQuery): Promise<Product[]> {
    return this.prisma.product.findMany({ where: { id: { in: ids } } });
  }
}

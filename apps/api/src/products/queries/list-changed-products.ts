import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Product } from '../../generated/prisma/client.js';

/** Products changed at or after `since`, active or not; all of them without it. */
export class ListChangedProductsQuery extends Query<Product[]> {
  constructor(readonly since: Date | null) {
    super();
  }
}

@QueryHandler(ListChangedProductsQuery)
export class ListChangedProductsHandler implements IQueryHandler<ListChangedProductsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ since }: ListChangedProductsQuery): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: since ? { updatedAt: { gte: since } } : {},
    });
  }
}

import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Product } from '../../generated/prisma/client.js';

export class GetProductQuery extends Query<Product | null> {
  constructor(readonly id: string) {
    super();
  }
}

@QueryHandler(GetProductQuery)
export class GetProductHandler implements IQueryHandler<GetProductQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ id }: GetProductQuery): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { id } });
  }
}

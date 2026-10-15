import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { RawMaterial } from '../../generated/prisma/client.js';

/** Raw materials changed at or after `since`, active or not; all of them without it. */
export class ListChangedRawMaterialsQuery extends Query<RawMaterial[]> {
  constructor(readonly since: Date | null) {
    super();
  }
}

@QueryHandler(ListChangedRawMaterialsQuery)
export class ListChangedRawMaterialsHandler implements IQueryHandler<ListChangedRawMaterialsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ since }: ListChangedRawMaterialsQuery): Promise<RawMaterial[]> {
    return this.prisma.rawMaterial.findMany({
      where: since ? { updatedAt: { gte: since } } : {},
    });
  }
}

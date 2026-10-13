import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { RawMaterial } from '../../generated/prisma/client.js';

export class ListActiveRawMaterialsQuery extends Query<RawMaterial[]> {}

@QueryHandler(ListActiveRawMaterialsQuery)
export class ListActiveRawMaterialsHandler implements IQueryHandler<ListActiveRawMaterialsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute(): Promise<RawMaterial[]> {
    return this.prisma.rawMaterial.findMany({
      where: { isActive: true },
      orderBy: { code: 'asc' },
    });
  }
}

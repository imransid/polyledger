import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { RawMaterial } from '../../generated/prisma/client.js';

export class GetRawMaterialsQuery extends Query<RawMaterial[]> {
  constructor(readonly ids: string[]) {
    super();
  }
}

@QueryHandler(GetRawMaterialsQuery)
export class GetRawMaterialsHandler implements IQueryHandler<GetRawMaterialsQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ ids }: GetRawMaterialsQuery): Promise<RawMaterial[]> {
    return this.prisma.rawMaterial.findMany({ where: { id: { in: ids } } });
  }
}

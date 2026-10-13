import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Machine } from '../../generated/prisma/client.js';

export class GetMachineQuery extends Query<Machine | null> {
  constructor(readonly id: string) {
    super();
  }
}

@QueryHandler(GetMachineQuery)
export class GetMachineHandler implements IQueryHandler<GetMachineQuery> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ id }: GetMachineQuery): Promise<Machine | null> {
    return this.prisma.machine.findUnique({ where: { id } });
  }
}

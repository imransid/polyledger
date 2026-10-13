import { ConflictException } from '@nestjs/common';
import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import {
  type MaterialCheck,
  MaterialPlanner,
} from '../infra/material-planner.js';

export interface OrderMaterialCheck extends Omit<
  MaterialCheck,
  'missingFormulas'
> {
  orderId: string;
  number: string;
}

export class GetMaterialCheckQuery extends Query<OrderMaterialCheck | null> {
  constructor(readonly orderId: string) {
    super();
  }
}

@QueryHandler(GetMaterialCheckQuery)
export class GetMaterialCheckHandler implements IQueryHandler<GetMaterialCheckQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planner: MaterialPlanner,
  ) {}

  async execute({
    orderId,
  }: GetMaterialCheckQuery): Promise<OrderMaterialCheck | null> {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id: orderId },
      include: { lines: true },
    });
    if (!order) {
      return null;
    }

    const { missingFormulas, ...plan } = await this.planner.plan(
      order.lines.map(({ productId, pieces }) => ({ productId, pieces })),
    );
    if (missingFormulas.length > 0) {
      throw new ConflictException(
        `No active formula for ${missingFormulas.map((p) => p.code).join(', ')}`,
      );
    }
    return { orderId, number: order.number, ...plan };
  }
}

import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { SalesOrderStatus } from '../../generated/prisma/client.js';
import { productCodes } from '../infra/references.js';
import { withLines } from '../infra/views.js';

export interface OrderDelivery {
  orderId: string;
  number: string;
  status: SalesOrderStatus;
  overDeliveryBasisPoints: number;
  shortCloseReason: string | null;
  lines: {
    lineNo: number;
    productId: string;
    code: string;
    orderedPieces: number;
    /** Delivered and not sent back for replacement. */
    deliveredPieces: number;
    /** Every piece sent back, whether replaced or credited. */
    returnedPieces: number;
    remainingPieces: number;
  }[];
}

export class GetOrderDeliveryQuery extends Query<OrderDelivery | null> {
  constructor(readonly orderId: string) {
    super();
  }
}

@QueryHandler(GetOrderDeliveryQuery)
export class GetOrderDeliveryHandler implements IQueryHandler<GetOrderDeliveryQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({
    orderId,
  }: GetOrderDeliveryQuery): Promise<OrderDelivery | null> {
    const order = await this.prisma.salesOrder.findUnique({
      where: { id: orderId },
      include: withLines,
    });
    if (!order) {
      return null;
    }
    const codes = await productCodes(
      this.queryBus,
      order.lines.map((line) => line.productId),
    );
    return {
      orderId: order.id,
      number: order.number,
      status: order.status,
      overDeliveryBasisPoints: order.overDeliveryBasisPoints,
      shortCloseReason: order.shortCloseReason,
      lines: order.lines.map((line) => ({
        lineNo: line.lineNo,
        productId: line.productId,
        code: codes.get(line.productId)!,
        orderedPieces: line.pieces,
        deliveredPieces: line.deliveredPieces,
        returnedPieces: line.returnedPieces,
        remainingPieces: Math.max(0, line.pieces - line.deliveredPieces),
      })),
    };
  }
}

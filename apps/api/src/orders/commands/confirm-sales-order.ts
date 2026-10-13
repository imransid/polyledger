import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  assertCustomerActive,
  assertProductsActive,
} from '../infra/references.js';
import { moveOrder } from '../infra/status.js';
import type { SalesOrderView } from '../infra/views.js';

export class ConfirmSalesOrderCommand extends Command<SalesOrderView> {
  constructor(
    readonly actorId: string,
    readonly orderId: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(ConfirmSalesOrderCommand)
export class ConfirmSalesOrderHandler implements ICommandHandler<ConfirmSalesOrderCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    orderId,
    idempotencyKey,
  }: ConfirmSalesOrderCommand): Promise<SalesOrderView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'ConfirmSalesOrder' },
        async () => {
          const order = await moveOrder(tx, orderId, 'confirm');
          await assertCustomerActive(this.queryBus, order.customerId);
          await assertProductsActive(
            this.queryBus,
            order.lines.map((line) => line.productId),
          );
          return order;
        },
      ),
    );
  }
}

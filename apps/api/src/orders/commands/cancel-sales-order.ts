import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { moveOrder } from '../infra/status.js';
import type { SalesOrderView } from '../infra/views.js';

export class CancelSalesOrderCommand extends Command<SalesOrderView> {
  constructor(
    readonly actorId: string,
    readonly orderId: string,
    readonly reason: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(CancelSalesOrderCommand)
export class CancelSalesOrderHandler implements ICommandHandler<CancelSalesOrderCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    orderId,
    reason,
    idempotencyKey,
  }: CancelSalesOrderCommand): Promise<SalesOrderView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'CancelSalesOrder' },
        () => moveOrder(tx, orderId, 'cancel', { cancelReason: reason }),
      ),
    );
  }
}

import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { moveOrder } from '../infra/status.js';
import type { SalesOrderView } from '../infra/views.js';

// Finishes an order before everything is delivered. It stays finished:
// returns and challan reversals never reopen it.
export class CloseOrderShortCommand extends Command<SalesOrderView> {
  constructor(
    readonly actorId: string,
    readonly orderId: string,
    readonly reason: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(CloseOrderShortCommand)
export class CloseOrderShortHandler implements ICommandHandler<CloseOrderShortCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    orderId,
    reason,
    idempotencyKey,
  }: CloseOrderShortCommand): Promise<SalesOrderView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'CloseOrderShort' },
        () =>
          moveOrder(tx, orderId, 'closeShort', { shortCloseReason: reason }),
      ),
    );
  }
}

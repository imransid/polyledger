import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { moveOrder } from '../infra/status.js';
import type { SalesOrderView } from '../infra/views.js';

// A manual button for now; dispatch will complete orders itself.
export class CompleteSalesOrderCommand extends Command<SalesOrderView> {
  constructor(
    readonly actorId: string,
    readonly orderId: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(CompleteSalesOrderCommand)
export class CompleteSalesOrderHandler implements ICommandHandler<CompleteSalesOrderCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    orderId,
    idempotencyKey,
  }: CompleteSalesOrderCommand): Promise<SalesOrderView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'CompleteSalesOrder' },
        () => moveOrder(tx, orderId, 'complete'),
      ),
    );
  }
}

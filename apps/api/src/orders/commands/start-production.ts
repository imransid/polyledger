import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { moveOrder } from '../infra/status.js';
import type { SalesOrderView } from '../infra/views.js';

// A manual button for now; the production module will move orders itself.
export class StartProductionCommand extends Command<SalesOrderView> {
  constructor(
    readonly actorId: string,
    readonly orderId: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(StartProductionCommand)
export class StartProductionHandler implements ICommandHandler<StartProductionCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    orderId,
    idempotencyKey,
  }: StartProductionCommand): Promise<SalesOrderView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'StartProduction' },
        () => moveOrder(tx, orderId, 'startProduction'),
      ),
    );
  }
}

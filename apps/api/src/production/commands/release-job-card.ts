import {
  Command,
  CommandBus,
  CommandHandler,
  type ICommandHandler,
} from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { MarkInProductionCommand } from '../../orders/commands/mark-in-production.js';
import { type JobCardView, moveJobCard } from '../infra/job-cards.js';

export class ReleaseJobCardCommand extends Command<JobCardView> {
  constructor(
    readonly actorId: string,
    readonly jobCardId: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// Releasing the first card of a sales order puts that order in production,
// in the same transaction.
@CommandHandler(ReleaseJobCardCommand)
export class ReleaseJobCardHandler implements ICommandHandler<ReleaseJobCardCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  execute({
    actorId,
    jobCardId,
    idempotencyKey,
  }: ReleaseJobCardCommand): Promise<JobCardView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'ReleaseJobCard' },
        async () => {
          const card = await moveJobCard(tx, jobCardId, 'release');
          if (card.salesOrderId) {
            await this.commandBus.execute(
              new MarkInProductionCommand(tx, card.salesOrderId),
            );
          }
          return card;
        },
      ),
    );
  }
}

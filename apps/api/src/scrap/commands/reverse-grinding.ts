import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  Command,
  CommandBus,
  CommandHandler,
  type ICommandHandler,
} from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ReverseStockDocumentCommand } from '../../stock/commands/reverse-stock-document.js';
import { type GrindingBatchView, toGrindingBatchView } from '../infra/views.js';

export class ReverseGrindingCommand extends Command<GrindingBatchView> {
  constructor(
    readonly actorId: string,
    readonly batchId: string,
    readonly reason: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// Puts the input back in the scrap yard and takes the ground regrind out of
// the store, so it fails once that regrind has been issued.
@CommandHandler(ReverseGrindingCommand)
export class ReverseGrindingHandler implements ICommandHandler<ReverseGrindingCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  execute({
    actorId,
    batchId,
    reason,
    idempotencyKey,
  }: ReverseGrindingCommand): Promise<GrindingBatchView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'ReverseGrinding' },
        async () => {
          const { count } = await tx.grindingBatch.updateMany({
            where: { id: batchId, reversedAt: null },
            data: { reversedAt: new Date() },
          });
          const batch = await tx.grindingBatch.findUnique({
            where: { id: batchId },
          });
          if (!batch) {
            throw new NotFoundException('Grinding batch not found');
          }
          if (count === 0) {
            throw new ConflictException('This batch is already reversed');
          }

          await this.commandBus.execute(
            new ReverseStockDocumentCommand(
              tx,
              actorId,
              batch.stockDocumentId,
              reason,
            ),
          );
          await recordEvent(tx, 'scrap.grinding_reversed', {
            batchId,
            reason,
          });
          return toGrindingBatchView(batch);
        },
      ),
    );
  }
}

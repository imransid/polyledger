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
import { JobCardReporter } from '../infra/job-card-reporter.js';
import {
  assertInWork,
  type EntryView,
  lockJobCard,
  toEntryView,
} from '../infra/job-cards.js';

export class ReverseProductionEntryCommand extends Command<EntryView> {
  constructor(
    readonly actorId: string,
    readonly jobCardId: string,
    readonly entryId: string,
    readonly reason: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// Entries are never edited. Reversing one gives back its material and takes
// its good pieces off the floor, so those pieces must not be handed over yet.
@CommandHandler(ReverseProductionEntryCommand)
export class ReverseProductionEntryHandler implements ICommandHandler<ReverseProductionEntryCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    private readonly reporter: JobCardReporter,
  ) {}

  execute({
    actorId,
    jobCardId,
    entryId,
    reason,
    idempotencyKey,
  }: ReverseProductionEntryCommand): Promise<EntryView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'ReverseProductionEntry' },
        async () => {
          const card = await lockJobCard(tx, jobCardId);
          const entry = await tx.productionEntry.findUnique({
            where: { id: entryId },
          });
          if (!entry || entry.jobCardId !== card.id) {
            throw new NotFoundException('Production entry not found');
          }
          if (entry.reversedAt) {
            throw new ConflictException('This entry is already reversed');
          }
          assertInWork(card);
          const { piecesOnFloor } = await this.reporter.floorStock(card);
          if (piecesOnFloor < entry.goodPieces) {
            throw new ConflictException(
              `${card.number} has only ${piecesOnFloor} good pieces left on the floor`,
            );
          }

          await this.commandBus.execute(
            new ReverseStockDocumentCommand(
              tx,
              actorId,
              entry.stockDocumentId,
              reason,
            ),
          );
          const reversed = await tx.productionEntry.update({
            where: { id: entryId },
            data: { reversedAt: new Date() },
            include: { materials: true },
          });
          await recordEvent(tx, 'production.entry_reversed', {
            entryId,
            jobCardId,
            jobCardNumber: card.number,
            reason,
          });
          return toEntryView(reversed);
        },
      ),
    );
  }
}

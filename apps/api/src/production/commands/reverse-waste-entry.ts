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
import { assertInWork, lockJobCard } from '../infra/job-cards.js';
import {
  toWasteEntryView,
  type WasteEntryView,
} from '../infra/waste-entries.js';

export class ReverseWasteEntryCommand extends Command<WasteEntryView> {
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

// Gives purge and sweepings back to the floor and takes the regrind out of
// the scrap yard, so it fails once that regrind has been ground or sold.
@CommandHandler(ReverseWasteEntryCommand)
export class ReverseWasteEntryHandler implements ICommandHandler<ReverseWasteEntryCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  execute({
    actorId,
    jobCardId,
    entryId,
    reason,
    idempotencyKey,
  }: ReverseWasteEntryCommand): Promise<WasteEntryView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'ReverseWasteEntry' },
        async () => {
          const card = await lockJobCard(tx, jobCardId);
          const entry = await tx.wasteEntry.findUnique({
            where: { id: entryId },
          });
          if (!entry || entry.jobCardId !== card.id) {
            throw new NotFoundException('Waste entry not found');
          }
          if (entry.reversedAt) {
            throw new ConflictException('This waste entry is already reversed');
          }
          assertInWork(card);

          await this.commandBus.execute(
            new ReverseStockDocumentCommand(
              tx,
              actorId,
              entry.stockDocumentId,
              reason,
            ),
          );
          const reversed = await tx.wasteEntry.update({
            where: { id: entryId },
            data: { reversedAt: new Date() },
            include: { lines: true },
          });
          await recordEvent(tx, 'production.waste_reversed', {
            entryId,
            jobCardId,
            jobCardNumber: card.number,
            reason,
          });
          return toWasteEntryView(reversed);
        },
      ),
    );
  }
}

import { ConflictException, NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';

export type ReviewOutcome = 'RESOLVED' | 'DISMISSED';

/** Closing a refused record. Neither outcome posts anything. */
export class ReviewRecordCommand extends Command<void> {
  constructor(
    readonly actorId: string,
    readonly recordId: string,
    readonly outcome: ReviewOutcome,
    readonly note: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(ReviewRecordCommand)
export class ReviewRecordHandler implements ICommandHandler<ReviewRecordCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    recordId,
    outcome,
    note,
    idempotencyKey,
  }: ReviewRecordCommand): Promise<void> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'ReviewRecord' },
        async () => {
          const { count } = await tx.syncedRecord.updateMany({
            where: { id: recordId, status: 'REJECTED' },
            data: {
              status: outcome,
              reviewedById: actorId,
              reviewedAt: new Date(),
              reviewNote: note,
            },
          });
          if (count === 0) {
            const record = await tx.syncedRecord.findUnique({
              where: { id: recordId },
            });
            throw record
              ? new ConflictException(`This record is ${record.status}`)
              : new NotFoundException('Record not found');
          }
          await recordEvent(tx, `sync.record_${outcome.toLowerCase()}`, {
            recordId,
            note,
          });
        },
      ),
    );
  }
}

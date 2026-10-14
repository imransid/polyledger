import { ConflictException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { JobCardReporter } from '../infra/job-card-reporter.js';
import {
  assertCan,
  type JobCardView,
  lockJobCard,
  moveJobCard,
} from '../infra/job-cards.js';

export class CancelJobCardCommand extends Command<JobCardView> {
  constructor(
    readonly actorId: string,
    readonly jobCardId: string,
    readonly reason: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// Only before any material is issued; reversing every issue slip counts.
@CommandHandler(CancelJobCardCommand)
export class CancelJobCardHandler implements ICommandHandler<CancelJobCardCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reporter: JobCardReporter,
  ) {}

  execute({
    actorId,
    jobCardId,
    reason,
    idempotencyKey,
  }: CancelJobCardCommand): Promise<JobCardView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'CancelJobCard' },
        async () => {
          const card = await lockJobCard(tx, jobCardId);
          assertCan(card, 'cancel');
          const { issued } = await this.reporter.floorStock(card);
          if ([...issued.values()].some((grams) => grams !== 0)) {
            throw new ConflictException(
              `${card.number} has material issued; reverse its issue slips first`,
            );
          }
          return moveJobCard(tx, jobCardId, 'cancel', { cancelReason: reason });
        },
      ),
    );
  }
}

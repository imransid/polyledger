import { ConflictException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { JobCardSummary } from '../domain/summary.js';
import { JobCardReporter } from '../infra/job-card-reporter.js';
import {
  assertCan,
  type JobCardView,
  lockJobCard,
  moveJobCard,
} from '../infra/job-cards.js';

export type ClosedJobCard = JobCardView & { summary: JobCardSummary };

export class CloseJobCardCommand extends Command<ClosedJobCard> {
  constructor(
    readonly actorId: string,
    readonly jobCardId: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(CloseJobCardCommand)
export class CloseJobCardHandler implements ICommandHandler<CloseJobCardCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reporter: JobCardReporter,
  ) {}

  execute({
    actorId,
    jobCardId,
    idempotencyKey,
  }: CloseJobCardCommand): Promise<ClosedJobCard> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'CloseJobCard' },
        async () => {
          const card = await lockJobCard(tx, jobCardId);
          assertCan(card, 'close');
          const { piecesOnFloor } = await this.reporter.floorStock(card);
          if (piecesOnFloor > 0) {
            throw new ConflictException(
              `${card.number} still has ${piecesOnFloor} good pieces on the floor; hand them over first`,
            );
          }

          const closed = await moveJobCard(tx, jobCardId, 'close', {
            closedAt: new Date(),
          });
          return { ...closed, summary: await this.reporter.summary(card) };
        },
      ),
    );
  }
}

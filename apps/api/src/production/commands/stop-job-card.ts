import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { type JobCardView, moveJobCard } from '../infra/job-cards.js';

export class StopJobCardCommand extends Command<JobCardView> {
  constructor(
    readonly actorId: string,
    readonly jobCardId: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(StopJobCardCommand)
export class StopJobCardHandler implements ICommandHandler<StopJobCardCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    jobCardId,
    idempotencyKey,
  }: StopJobCardCommand): Promise<JobCardView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'StopJobCard' },
        () => moveJobCard(tx, jobCardId, 'stop'),
      ),
    );
  }
}

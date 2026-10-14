import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { isUniqueViolation } from '../../database/errors.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { GetMachineQuery } from '../../machines/queries/get-machine.js';
import { GetMouldQuery } from '../../moulds/queries/get-mould.js';
import {
  type JobCardView,
  lockJobCard,
  moveJobCard,
} from '../infra/job-cards.js';

export class StartJobCardCommand extends Command<JobCardView> {
  constructor(
    readonly actorId: string,
    readonly jobCardId: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// The mould is on the machine. A machine or mould runs one card at a time;
// the database enforces that too, for two starts at the same moment.
@CommandHandler(StartJobCardCommand)
export class StartJobCardHandler implements ICommandHandler<StartJobCardCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({
    actorId,
    jobCardId,
    idempotencyKey,
  }: StartJobCardCommand): Promise<JobCardView> {
    try {
      return await this.prisma.$transaction((tx) =>
        withIdempotencyKey(
          tx,
          { actorId, key: idempotencyKey, command: 'StartJobCard' },
          async () => {
            const card = await lockJobCard(tx, jobCardId);
            const [machine, mould] = await Promise.all([
              this.queryBus.execute(new GetMachineQuery(card.machineId)),
              this.queryBus.execute(new GetMouldQuery(card.mouldId)),
            ]);
            if (machine!.status !== 'ACTIVE') {
              throw new BadRequestException(
                `Machine ${machine!.code} is ${machine!.status}`,
              );
            }
            if (mould!.status !== 'ACTIVE') {
              throw new BadRequestException(
                `Mould ${mould!.code} is ${mould!.status}`,
              );
            }

            const busy = await tx.jobCard.findFirst({
              where: {
                status: 'RUNNING',
                id: { not: card.id },
                OR: [{ machineId: card.machineId }, { mouldId: card.mouldId }],
              },
            });
            if (busy) {
              const what =
                busy.machineId === card.machineId
                  ? `Machine ${machine!.code}`
                  : `Mould ${mould!.code}`;
              throw new ConflictException(
                `${what} is already running ${busy.number}`,
              );
            }
            return moveJobCard(tx, jobCardId, 'start');
          },
        ),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'The machine or mould is already running another job card',
        );
      }
      throw error;
    }
  }
}

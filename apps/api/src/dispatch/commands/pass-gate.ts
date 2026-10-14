import { ConflictException, NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  type ChallanView,
  toChallanView,
  withDetails,
} from '../infra/views.js';

export class PassGateCommand extends Command<ChallanView> {
  constructor(
    readonly actorId: string,
    readonly challanId: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// Only a check at the gate: the stock left the store with the challan. Once
// passed, the challan can no longer be reversed, only returned against.
@CommandHandler(PassGateCommand)
export class PassGateHandler implements ICommandHandler<PassGateCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    challanId,
    idempotencyKey,
  }: PassGateCommand): Promise<ChallanView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'PassGate' },
        async () => {
          const { count } = await tx.deliveryChallan.updateMany({
            where: {
              id: challanId,
              gatePassStatus: 'PENDING',
              reversedAt: null,
            },
            data: {
              gatePassStatus: 'PASSED',
              gatePassedAt: new Date(),
              gatePassedById: actorId,
            },
          });
          const challan = await tx.deliveryChallan.findUnique({
            where: { id: challanId },
            include: withDetails,
          });
          if (!challan) {
            throw new NotFoundException('Delivery challan not found');
          }
          if (count === 0) {
            throw new ConflictException(
              challan.reversedAt
                ? `${challan.number} is reversed`
                : `${challan.number} has already passed the gate`,
            );
          }
          await recordEvent(tx, 'dispatch.gate_passed', {
            challanId,
            number: challan.number,
          });
          return toChallanView(challan);
        },
      ),
    );
  }
}

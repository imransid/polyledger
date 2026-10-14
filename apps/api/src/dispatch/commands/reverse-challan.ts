import { ConflictException } from '@nestjs/common';
import {
  Command,
  CommandBus,
  CommandHandler,
  type ICommandHandler,
} from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import { AdjustDeliveriesCommand } from '../../orders/commands/adjust-deliveries.js';
import { ReverseStockDocumentCommand } from '../../stock/commands/reverse-stock-document.js';
import { lockChallan } from '../infra/challans.js';
import {
  type ChallanView,
  toChallanView,
  withDetails,
} from '../infra/views.js';

export class ReverseChallanCommand extends Command<ChallanView> {
  constructor(
    readonly actorId: string,
    readonly challanId: string,
    readonly reason: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// The goods never left the gate: they go back into the store and the order
// counts them as not delivered, reopening it if it had completed.
@CommandHandler(ReverseChallanCommand)
export class ReverseChallanHandler implements ICommandHandler<ReverseChallanCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  execute({
    actorId,
    challanId,
    reason,
    idempotencyKey,
  }: ReverseChallanCommand): Promise<ChallanView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'ReverseChallan' },
        async () => {
          const challan = await lockChallan(tx, challanId);
          if (challan.reversedAt) {
            throw new ConflictException('This challan is already reversed');
          }
          if (challan.gatePassStatus === 'PASSED') {
            throw new ConflictException(
              `${challan.number} has passed the gate; record a customer return instead`,
            );
          }

          await this.commandBus.execute(
            new AdjustDeliveriesCommand(
              tx,
              challan.orderId,
              challan.lines.map(({ productId, pieces }) => ({
                productId,
                deliveredPieces: -pieces,
                returnedPieces: 0,
              })),
            ),
          );
          await this.commandBus.execute(
            new ReverseStockDocumentCommand(
              tx,
              actorId,
              challan.stockDocumentId,
              reason,
            ),
          );
          const reversed = await tx.deliveryChallan.update({
            where: { id: challanId },
            data: { reversedAt: new Date() },
            include: withDetails,
          });
          await recordEvent(tx, 'dispatch.challan_reversed', {
            challanId,
            number: challan.number,
            orderId: challan.orderId,
            reason,
          });
          return toChallanView(reversed);
        },
      ),
    );
  }
}

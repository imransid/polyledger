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
import { AdjustDeliveriesCommand } from '../../orders/commands/adjust-deliveries.js';
import { ReverseStockDocumentCommand } from '../../stock/commands/reverse-stock-document.js';
import { addReturnedPieces, lockChallan } from '../infra/challans.js';
import { type ReturnView, toReturnView } from '../infra/views.js';

export class ReverseCustomerReturnCommand extends Command<ReturnView> {
  constructor(
    readonly actorId: string,
    readonly returnId: string,
    readonly reason: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// The pieces leave the store again and count as delivered again, so this
// fails if a replacement has already been sent for them.
@CommandHandler(ReverseCustomerReturnCommand)
export class ReverseCustomerReturnHandler implements ICommandHandler<ReverseCustomerReturnCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  execute({
    actorId,
    returnId,
    reason,
    idempotencyKey,
  }: ReverseCustomerReturnCommand): Promise<ReturnView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'ReverseCustomerReturn' },
        async () => {
          const found = await tx.customerReturn.findUnique({
            where: { id: returnId },
            include: { lines: true },
          });
          if (!found) {
            throw new NotFoundException('Customer return not found');
          }
          const challan = await lockChallan(tx, found.challanId);
          const { count } = await tx.customerReturn.updateMany({
            where: { id: returnId, reversedAt: null },
            data: { reversedAt: new Date() },
          });
          if (count === 0) {
            throw new ConflictException('This return is already reversed');
          }

          await this.commandBus.execute(
            new AdjustDeliveriesCommand(
              tx,
              challan.orderId,
              found.lines.map(({ productId, pieces }) => ({
                productId,
                deliveredPieces: found.settlement === 'REPLACE' ? pieces : 0,
                returnedPieces: -pieces,
              })),
            ),
          );
          await addReturnedPieces(
            tx,
            challan.id,
            found.lines.map(({ productId, pieces }) => ({
              productId,
              pieces: -pieces,
            })),
          );
          await this.commandBus.execute(
            new ReverseStockDocumentCommand(
              tx,
              actorId,
              found.stockDocumentId,
              reason,
            ),
          );
          await recordEvent(tx, 'dispatch.customer_return_reversed', {
            returnId,
            number: found.number,
            challanNumber: challan.number,
            reason,
          });
          return toReturnView(
            await tx.customerReturn.findUniqueOrThrow({
              where: { id: returnId },
              include: { lines: true },
            }),
          );
        },
      ),
    );
  }
}

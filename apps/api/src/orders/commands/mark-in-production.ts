import { NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { Prisma } from '../../generated/prisma/client.js';
import { moveOrder } from '../infra/status.js';

// Production releasing a job card for this order. Runs inside the caller's
// transaction so the release and the order's status commit together. An
// order already in production is left as it is.
export class MarkInProductionCommand extends Command<void> {
  constructor(
    readonly tx: Prisma.TransactionClient,
    readonly orderId: string,
  ) {
    super();
  }
}

@CommandHandler(MarkInProductionCommand)
export class MarkInProductionHandler implements ICommandHandler<MarkInProductionCommand> {
  async execute({ tx, orderId }: MarkInProductionCommand): Promise<void> {
    const order = await tx.salesOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Sales order not found');
    }
    if (order.status !== 'IN_PRODUCTION') {
      await moveOrder(tx, orderId, 'startProduction');
    }
  }
}

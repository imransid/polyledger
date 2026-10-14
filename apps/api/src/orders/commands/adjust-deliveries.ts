import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import type { Prisma } from '../../generated/prisma/client.js';
import type { DeliveryChange } from '../domain/deliveries.js';
import { applyDeliveryChanges, lockOrder } from '../infra/deliveries.js';

// Dispatch reversing a challan, or recording or reversing a customer
// return, inside its own transaction. The order completes or reopens to
// match what is delivered now.
export class AdjustDeliveriesCommand extends Command<void> {
  constructor(
    readonly tx: Prisma.TransactionClient,
    readonly orderId: string,
    readonly changes: DeliveryChange[],
  ) {
    super();
  }
}

@CommandHandler(AdjustDeliveriesCommand)
export class AdjustDeliveriesHandler implements ICommandHandler<AdjustDeliveriesCommand> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute({
    tx,
    orderId,
    changes,
  }: AdjustDeliveriesCommand): Promise<void> {
    const order = await lockOrder(tx, orderId);
    await applyDeliveryChanges(tx, this.queryBus, order, changes);
  }
}

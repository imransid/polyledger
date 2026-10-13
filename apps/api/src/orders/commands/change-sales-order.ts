import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { fromDateString } from '../../common/dates.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  CONFIRMED_CHANGE_RULE,
  describeChanges,
  isAllowedOnConfirmed,
  type OrderChanges,
  type OrderSnapshot,
} from '../domain/changes.js';
import {
  assertCustomerActive,
  assertProductsActive,
} from '../infra/references.js';
import {
  type SalesOrderView,
  snapshotOf,
  toView,
  withLines,
} from '../infra/views.js';

export class ChangeSalesOrderCommand extends Command<SalesOrderView> {
  constructor(
    readonly actorId: string,
    readonly orderId: string,
    readonly changes: OrderChanges,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(ChangeSalesOrderCommand)
export class ChangeSalesOrderHandler implements ICommandHandler<ChangeSalesOrderCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    orderId,
    changes,
    idempotencyKey,
  }: ChangeSalesOrderCommand): Promise<SalesOrderView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'ChangeSalesOrder' },
        async () => {
          // Locked so a status change can't slip in between check and write.
          const [locked] = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM sales_orders WHERE id = ${orderId}::uuid FOR UPDATE`;
          if (!locked) {
            throw new NotFoundException('Sales order not found');
          }
          const order = toView(
            await tx.salesOrder.findUniqueOrThrow({
              where: { id: orderId },
              include: withLines,
            }),
          );
          const before = snapshotOf(order);
          const after = await this.apply(order, before, changes);
          if (after.deliveryDate < after.orderDate) {
            throw new BadRequestException(
              'The delivery date cannot be before the order date',
            );
          }

          await tx.salesOrder.update({
            where: { id: orderId },
            data: {
              customerId: after.customerId,
              orderDate: fromDateString(after.orderDate),
              deliveryDate: fromDateString(after.deliveryDate),
              customerPo: after.customerPo,
              notes: after.notes,
            },
          });
          if (changes.lines) {
            await tx.salesOrderLine.deleteMany({ where: { orderId } });
            await tx.salesOrderLine.createMany({
              data: after.lines.map((line, index) => ({
                orderId,
                lineNo: index + 1,
                ...line,
              })),
            });
          }

          const changed = toView(
            await tx.salesOrder.findUniqueOrThrow({
              where: { id: orderId },
              include: withLines,
            }),
          );
          const described = describeChanges(before, snapshotOf(changed));
          if (Object.keys(described).length > 0) {
            await recordEvent(tx, 'sales_order.changed', {
              orderId,
              number: order.number,
              status: order.status,
              changes: described,
            });
          }
          return changed;
        },
      ),
    );
  }

  private async apply(
    order: SalesOrderView,
    before: OrderSnapshot,
    changes: OrderChanges,
  ): Promise<OrderSnapshot> {
    if (order.status === 'CONFIRMED') {
      if (!isAllowedOnConfirmed(before, changes)) {
        throw new ConflictException(CONFIRMED_CHANGE_RULE);
      }
      const pieces = new Map(
        (changes.lines ?? before.lines).map((line) => [
          line.productId,
          line.pieces,
        ]),
      );
      return {
        ...before,
        deliveryDate: changes.deliveryDate ?? before.deliveryDate,
        lines: before.lines.map((line) => ({
          ...line,
          pieces: pieces.get(line.productId)!,
        })),
      };
    }

    if (order.status !== 'DRAFT') {
      throw new ConflictException(
        `${order.number} is ${order.status} and can no longer be changed`,
      );
    }
    if (changes.customerId) {
      await assertCustomerActive(this.queryBus, changes.customerId);
    }
    if (changes.lines) {
      await assertProductsActive(
        this.queryBus,
        changes.lines.map((line) => line.productId),
      );
    }
    return { ...before, ...changes };
  }
}

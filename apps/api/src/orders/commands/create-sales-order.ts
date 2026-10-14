import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { fromDateString } from '../../common/dates.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { nextNumber } from '../../database/numbers.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { OrderLine } from '../domain/changes.js';
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

export interface NewSalesOrder {
  customerId: string;
  orderDate: string;
  deliveryDate: string;
  customerPo: string | null;
  notes: string | null;
  overDeliveryBasisPoints: number;
  lines: OrderLine[];
}

export class CreateSalesOrderCommand extends Command<SalesOrderView> {
  constructor(
    readonly actorId: string,
    readonly order: NewSalesOrder,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(CreateSalesOrderCommand)
export class CreateSalesOrderHandler implements ICommandHandler<CreateSalesOrderCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    order,
    idempotencyKey,
  }: CreateSalesOrderCommand): Promise<SalesOrderView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'CreateSalesOrder' },
        async () => {
          await assertCustomerActive(this.queryBus, order.customerId);
          await assertProductsActive(
            this.queryBus,
            order.lines.map((line) => line.productId),
          );

          const created = toView(
            await tx.salesOrder.create({
              data: {
                number: await nextNumber(tx, 'sales_order_number', 'SO'),
                customerId: order.customerId,
                orderDate: fromDateString(order.orderDate),
                deliveryDate: fromDateString(order.deliveryDate),
                customerPo: order.customerPo,
                notes: order.notes,
                overDeliveryBasisPoints: order.overDeliveryBasisPoints,
                createdById: actorId,
                lines: {
                  create: order.lines.map((line, index) => ({
                    lineNo: index + 1,
                    ...line,
                  })),
                },
              },
              include: withLines,
            }),
          );
          await recordEvent(tx, 'sales_order.created', {
            orderId: created.id,
            number: created.number,
            ...snapshotOf(created),
          });
          return created;
        },
      ),
    );
  }
}

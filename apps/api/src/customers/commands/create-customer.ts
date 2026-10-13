import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { throwIfCodeInUse } from '../../common/master-data.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Customer } from '../../generated/prisma/client.js';

export interface NewCustomer {
  code: string;
  name: string;
  phone: string;
  address: string;
}

export class CreateCustomerCommand extends Command<Customer> {
  constructor(
    readonly actorId: string,
    readonly customer: NewCustomer,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(CreateCustomerCommand)
export class CreateCustomerHandler implements ICommandHandler<CreateCustomerCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    actorId,
    customer,
    idempotencyKey,
  }: CreateCustomerCommand): Promise<Customer> {
    try {
      return await this.prisma.$transaction((tx) =>
        withIdempotencyKey(
          tx,
          { actorId, key: idempotencyKey, command: 'CreateCustomer' },
          () => tx.customer.create({ data: customer }),
        ),
      );
    } catch (error) {
      throwIfCodeInUse(error, customer.code);
      throw error;
    }
  }
}

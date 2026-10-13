import { NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Customer } from '../../generated/prisma/client.js';
import type { NewCustomer } from './create-customer.js';

export type CustomerChanges = Partial<Omit<NewCustomer, 'code'>> & {
  isActive?: boolean;
};

export class UpdateCustomerCommand extends Command<Customer> {
  constructor(
    readonly actorId: string,
    readonly id: string,
    readonly changes: CustomerChanges,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(UpdateCustomerCommand)
export class UpdateCustomerHandler implements ICommandHandler<UpdateCustomerCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    id,
    changes,
    idempotencyKey,
  }: UpdateCustomerCommand): Promise<Customer> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'UpdateCustomer' },
        async () => {
          if (!(await tx.customer.findUnique({ where: { id } }))) {
            throw new NotFoundException('Customer not found');
          }
          return tx.customer.update({ where: { id }, data: changes });
        },
      ),
    );
  }
}

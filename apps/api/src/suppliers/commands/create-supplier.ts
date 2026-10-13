import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { throwIfCodeInUse } from '../../common/master-data.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Supplier } from '../../generated/prisma/client.js';

export interface NewSupplier {
  code: string;
  name: string;
  phone: string;
  address: string;
}

export class CreateSupplierCommand extends Command<Supplier> {
  constructor(
    readonly actorId: string,
    readonly supplier: NewSupplier,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(CreateSupplierCommand)
export class CreateSupplierHandler implements ICommandHandler<CreateSupplierCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    actorId,
    supplier,
    idempotencyKey,
  }: CreateSupplierCommand): Promise<Supplier> {
    try {
      return await this.prisma.$transaction((tx) =>
        withIdempotencyKey(
          tx,
          { actorId, key: idempotencyKey, command: 'CreateSupplier' },
          () => tx.supplier.create({ data: supplier }),
        ),
      );
    } catch (error) {
      throwIfCodeInUse(error, supplier.code);
      throw error;
    }
  }
}

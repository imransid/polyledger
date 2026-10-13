import { NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Supplier } from '../../generated/prisma/client.js';
import type { NewSupplier } from './create-supplier.js';

export type SupplierChanges = Partial<Omit<NewSupplier, 'code'>> & {
  isActive?: boolean;
};

export class UpdateSupplierCommand extends Command<Supplier> {
  constructor(
    readonly actorId: string,
    readonly id: string,
    readonly changes: SupplierChanges,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(UpdateSupplierCommand)
export class UpdateSupplierHandler implements ICommandHandler<UpdateSupplierCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    id,
    changes,
    idempotencyKey,
  }: UpdateSupplierCommand): Promise<Supplier> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'UpdateSupplier' },
        async () => {
          if (!(await tx.supplier.findUnique({ where: { id } }))) {
            throw new NotFoundException('Supplier not found');
          }
          return tx.supplier.update({ where: { id }, data: changes });
        },
      ),
    );
  }
}

import { NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Product } from '../../generated/prisma/client.js';
import type { NewProduct } from './create-product.js';

export type ProductChanges = Partial<Omit<NewProduct, 'code'>> & {
  isActive?: boolean;
};

export class UpdateProductCommand extends Command<Product> {
  constructor(
    readonly actorId: string,
    readonly id: string,
    readonly changes: ProductChanges,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(UpdateProductCommand)
export class UpdateProductHandler implements ICommandHandler<UpdateProductCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    id,
    changes,
    idempotencyKey,
  }: UpdateProductCommand): Promise<Product> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'UpdateProduct' },
        async () => {
          if (!(await tx.product.findUnique({ where: { id } }))) {
            throw new NotFoundException('Product not found');
          }
          return tx.product.update({ where: { id }, data: changes });
        },
      ),
    );
  }
}

import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { throwIfCodeInUse } from '../../common/master-data.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Product } from '../../generated/prisma/client.js';

export interface NewProduct {
  code: string;
  name: string;
  pieceWeightMg: number;
  colour: string;
  piecesPerCarton: number;
}

export class CreateProductCommand extends Command<Product> {
  constructor(
    readonly actorId: string,
    readonly product: NewProduct,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(CreateProductCommand)
export class CreateProductHandler implements ICommandHandler<CreateProductCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    actorId,
    product,
    idempotencyKey,
  }: CreateProductCommand): Promise<Product> {
    try {
      return await this.prisma.$transaction((tx) =>
        withIdempotencyKey(
          tx,
          { actorId, key: idempotencyKey, command: 'CreateProduct' },
          () => tx.product.create({ data: product }),
        ),
      );
    } catch (error) {
      throwIfCodeInUse(error, product.code);
      throw error;
    }
  }
}

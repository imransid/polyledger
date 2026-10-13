import { BadRequestException } from '@nestjs/common';
import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { throwIfCodeInUse } from '../../common/master-data.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Mould } from '../../generated/prisma/client.js';
import { GetProductQuery } from '../../products/queries/get-product.js';

export interface NewMould {
  code: string;
  name: string;
  cavities: number;
  cycleTimeTenths: number;
  productId: string;
}

export class CreateMouldCommand extends Command<Mould> {
  constructor(
    readonly actorId: string,
    readonly mould: NewMould,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

export async function assertProductIsActive(
  queryBus: QueryBus,
  productId: string,
): Promise<void> {
  const product = await queryBus.execute(new GetProductQuery(productId));
  if (!product?.isActive) {
    throw new BadRequestException('Product not found or inactive');
  }
}

@CommandHandler(CreateMouldCommand)
export class CreateMouldHandler implements ICommandHandler<CreateMouldCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({
    actorId,
    mould,
    idempotencyKey,
  }: CreateMouldCommand): Promise<Mould> {
    try {
      return await this.prisma.$transaction((tx) =>
        withIdempotencyKey(
          tx,
          { actorId, key: idempotencyKey, command: 'CreateMould' },
          async () => {
            await assertProductIsActive(this.queryBus, mould.productId);
            return tx.mould.create({ data: mould });
          },
        ),
      );
    } catch (error) {
      throwIfCodeInUse(error, mould.code);
      throw error;
    }
  }
}

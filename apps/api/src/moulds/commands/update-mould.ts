import { NotFoundException } from '@nestjs/common';
import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Mould, MouldStatus } from '../../generated/prisma/client.js';
import { assertProductIsActive, type NewMould } from './create-mould.js';

export type MouldChanges = Partial<Omit<NewMould, 'code'>> & {
  status?: MouldStatus;
};

export class UpdateMouldCommand extends Command<Mould> {
  constructor(
    readonly actorId: string,
    readonly id: string,
    readonly changes: MouldChanges,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(UpdateMouldCommand)
export class UpdateMouldHandler implements ICommandHandler<UpdateMouldCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    id,
    changes,
    idempotencyKey,
  }: UpdateMouldCommand): Promise<Mould> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'UpdateMould' },
        async () => {
          if (!(await tx.mould.findUnique({ where: { id } }))) {
            throw new NotFoundException('Mould not found');
          }
          if (changes.productId) {
            await assertProductIsActive(this.queryBus, changes.productId);
          }
          return tx.mould.update({ where: { id }, data: changes });
        },
      ),
    );
  }
}

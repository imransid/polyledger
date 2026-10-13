import { NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { RawMaterial } from '../../generated/prisma/client.js';
import type { NewRawMaterial } from './create-raw-material.js';

export type RawMaterialChanges = Partial<Omit<NewRawMaterial, 'code'>> & {
  isActive?: boolean;
};

export class UpdateRawMaterialCommand extends Command<RawMaterial> {
  constructor(
    readonly actorId: string,
    readonly id: string,
    readonly changes: RawMaterialChanges,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(UpdateRawMaterialCommand)
export class UpdateRawMaterialHandler implements ICommandHandler<UpdateRawMaterialCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    id,
    changes,
    idempotencyKey,
  }: UpdateRawMaterialCommand): Promise<RawMaterial> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'UpdateRawMaterial' },
        async () => {
          if (!(await tx.rawMaterial.findUnique({ where: { id } }))) {
            throw new NotFoundException('Raw material not found');
          }
          return tx.rawMaterial.update({ where: { id }, data: changes });
        },
      ),
    );
  }
}

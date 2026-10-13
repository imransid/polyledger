import { NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Location } from '../../generated/prisma/client.js';

// The kind never changes: stock already there might break the storage rules.
export interface LocationChanges {
  name?: string;
  isActive?: boolean;
}

export class UpdateLocationCommand extends Command<Location> {
  constructor(
    readonly actorId: string,
    readonly id: string,
    readonly changes: LocationChanges,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(UpdateLocationCommand)
export class UpdateLocationHandler implements ICommandHandler<UpdateLocationCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    id,
    changes,
    idempotencyKey,
  }: UpdateLocationCommand): Promise<Location> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'UpdateLocation' },
        async () => {
          if (!(await tx.location.findUnique({ where: { id } }))) {
            throw new NotFoundException('Location not found');
          }
          return tx.location.update({ where: { id }, data: changes });
        },
      ),
    );
  }
}

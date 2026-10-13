import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { throwIfCodeInUse } from '../../common/master-data.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Location, LocationKind } from '../../generated/prisma/client.js';

export interface NewLocation {
  code: string;
  name: string;
  kind: LocationKind;
}

export class CreateLocationCommand extends Command<Location> {
  constructor(
    readonly actorId: string,
    readonly location: NewLocation,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(CreateLocationCommand)
export class CreateLocationHandler implements ICommandHandler<CreateLocationCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    actorId,
    location,
    idempotencyKey,
  }: CreateLocationCommand): Promise<Location> {
    try {
      return await this.prisma.$transaction((tx) =>
        withIdempotencyKey(
          tx,
          { actorId, key: idempotencyKey, command: 'CreateLocation' },
          () => tx.location.create({ data: location }),
        ),
      );
    } catch (error) {
      throwIfCodeInUse(error, location.code);
      throw error;
    }
  }
}

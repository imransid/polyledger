import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { throwIfCodeInUse } from '../../common/master-data.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  RawMaterial,
  RawMaterialType,
} from '../../generated/prisma/client.js';

export interface NewRawMaterial {
  code: string;
  name: string;
  type: RawMaterialType;
  minimumStockGrams: number;
}

export class CreateRawMaterialCommand extends Command<RawMaterial> {
  constructor(
    readonly actorId: string,
    readonly material: NewRawMaterial,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(CreateRawMaterialCommand)
export class CreateRawMaterialHandler implements ICommandHandler<CreateRawMaterialCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    actorId,
    material,
    idempotencyKey,
  }: CreateRawMaterialCommand): Promise<RawMaterial> {
    try {
      return await this.prisma.$transaction((tx) =>
        withIdempotencyKey(
          tx,
          { actorId, key: idempotencyKey, command: 'CreateRawMaterial' },
          () => tx.rawMaterial.create({ data: material }),
        ),
      );
    } catch (error) {
      throwIfCodeInUse(error, material.code);
      throw error;
    }
  }
}

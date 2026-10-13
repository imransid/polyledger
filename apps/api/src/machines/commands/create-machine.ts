import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { throwIfCodeInUse } from '../../common/master-data.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Machine } from '../../generated/prisma/client.js';

export interface NewMachine {
  code: string;
  name: string;
  tonnage: number;
}

export class CreateMachineCommand extends Command<Machine> {
  constructor(
    readonly actorId: string,
    readonly machine: NewMachine,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(CreateMachineCommand)
export class CreateMachineHandler implements ICommandHandler<CreateMachineCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    actorId,
    machine,
    idempotencyKey,
  }: CreateMachineCommand): Promise<Machine> {
    try {
      return await this.prisma.$transaction((tx) =>
        withIdempotencyKey(
          tx,
          { actorId, key: idempotencyKey, command: 'CreateMachine' },
          () => tx.machine.create({ data: machine }),
        ),
      );
    } catch (error) {
      throwIfCodeInUse(error, machine.code);
      throw error;
    }
  }
}

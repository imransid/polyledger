import { NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { Machine, MachineStatus } from '../../generated/prisma/client.js';
import type { NewMachine } from './create-machine.js';

export type MachineChanges = Partial<Omit<NewMachine, 'code'>> & {
  status?: MachineStatus;
};

export class UpdateMachineCommand extends Command<Machine> {
  constructor(
    readonly actorId: string,
    readonly id: string,
    readonly changes: MachineChanges,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(UpdateMachineCommand)
export class UpdateMachineHandler implements ICommandHandler<UpdateMachineCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    id,
    changes,
    idempotencyKey,
  }: UpdateMachineCommand): Promise<Machine> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'UpdateMachine' },
        async () => {
          if (!(await tx.machine.findUnique({ where: { id } }))) {
            throw new NotFoundException('Machine not found');
          }
          return tx.machine.update({ where: { id }, data: changes });
        },
      ),
    );
  }
}

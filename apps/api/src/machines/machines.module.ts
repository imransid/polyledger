import { Module } from '@nestjs/common';
import { CreateMachineHandler } from './commands/create-machine.js';
import { UpdateMachineHandler } from './commands/update-machine.js';
import { MachinesController } from './machines.controller.js';
import { GetMachineHandler } from './queries/get-machine.js';
import { ListMachinesHandler } from './queries/list-machines.js';

@Module({
  controllers: [MachinesController],
  providers: [
    CreateMachineHandler,
    UpdateMachineHandler,
    ListMachinesHandler,
    GetMachineHandler,
  ],
})
export class MachinesModule {}

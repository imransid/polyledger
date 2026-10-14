import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';
import { machineResponse } from './responses.js';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  type AuthUser,
  CurrentUser,
  IdempotencyKey,
  Roles,
} from '../auth/decorators.js';
import { found, listQuery, pageOf } from '../common/list-query.js';
import {
  codeSchema,
  countSchema,
  MASTER_DATA_EDITORS,
  MASTER_DATA_READERS,
  nameSchema,
} from '../common/master-data.js';
import { MachineStatus } from '../generated/prisma/client.js';
import { CreateMachineCommand } from './commands/create-machine.js';
import { UpdateMachineCommand } from './commands/update-machine.js';
import { GetMachineQuery } from './queries/get-machine.js';
import { ListMachinesQuery } from './queries/list-machines.js';

const machineBody = z.object({
  code: codeSchema,
  name: nameSchema,
  tonnage: countSchema,
});

const machineChanges = machineBody
  .omit({ code: true })
  .extend({ status: z.enum(MachineStatus) })
  .partial()
  .strict();

const machineList = listQuery.extend({
  status: z.enum(MachineStatus).optional(),
});

@Roles(...MASTER_DATA_READERS)
@Controller('machines')
export class MachinesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOkResponse({ standardSchema: pageOf(machineResponse) })
  list(@Query({ schema: machineList }) query: z.infer<typeof machineList>) {
    return this.queryBus.execute(new ListMachinesQuery(query));
  }

  @Get(':id')
  @ApiOkResponse({ standardSchema: machineResponse })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return found(
      await this.queryBus.execute(new GetMachineQuery(id)),
      'Machine',
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Post()
  @ApiCreatedResponse({ standardSchema: machineResponse })
  create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: machineBody }) body: z.infer<typeof machineBody>,
  ) {
    return this.commandBus.execute(
      new CreateMachineCommand(user.id, body, idempotencyKey),
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Patch(':id')
  @ApiOkResponse({ standardSchema: machineResponse })
  update(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: machineChanges }) changes: z.infer<typeof machineChanges>,
  ) {
    return this.commandBus.execute(
      new UpdateMachineCommand(user.id, id, changes, idempotencyKey),
    );
  }
}

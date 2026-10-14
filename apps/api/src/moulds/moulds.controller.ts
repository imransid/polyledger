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
import { mouldResponse } from './responses.js';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  type AuthUser,
  CurrentUser,
  FACTORY_ROLES,
  IdempotencyKey,
  Roles,
} from '../auth/decorators.js';
import { found, listQuery, pageOf } from '../common/list-query.js';
import {
  codeSchema,
  countSchema,
  MASTER_DATA_EDITORS,
  nameSchema,
} from '../common/master-data.js';
import { INT_MAX } from '../common/quantities.js';
import { MouldStatus } from '../generated/prisma/client.js';
import { CreateMouldCommand } from './commands/create-mould.js';
import { UpdateMouldCommand } from './commands/update-mould.js';
import { GetMouldQuery } from './queries/get-mould.js';
import { ListMouldsQuery } from './queries/list-moulds.js';

const runnerWeight = z.number().int().min(0).max(INT_MAX);

const mouldBody = z.object({
  code: codeSchema,
  name: nameSchema,
  cavities: countSchema,
  cycleTimeTenths: countSchema,
  runnerWeightMg: runnerWeight.default(0),
  productId: z.uuid(),
});

// No defaults here: under partial() zod would fill them in and overwrite.
const mouldChanges = mouldBody
  .omit({ code: true })
  .extend({ runnerWeightMg: runnerWeight, status: z.enum(MouldStatus) })
  .partial()
  .strict();

const mouldList = listQuery.extend({
  status: z.enum(MouldStatus).optional(),
  productId: z.uuid().optional(),
});

// Operators read moulds too: they load them on the machines.
@Roles(...FACTORY_ROLES)
@Controller('moulds')
export class MouldsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOkResponse({ standardSchema: pageOf(mouldResponse) })
  list(@Query({ schema: mouldList }) query: z.infer<typeof mouldList>) {
    return this.queryBus.execute(new ListMouldsQuery(query));
  }

  @Get(':id')
  @ApiOkResponse({ standardSchema: mouldResponse })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return found(await this.queryBus.execute(new GetMouldQuery(id)), 'Mould');
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Post()
  @ApiCreatedResponse({ standardSchema: mouldResponse })
  create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: mouldBody }) body: z.infer<typeof mouldBody>,
  ) {
    return this.commandBus.execute(
      new CreateMouldCommand(user.id, body, idempotencyKey),
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Patch(':id')
  @ApiOkResponse({ standardSchema: mouldResponse })
  update(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: mouldChanges }) changes: z.infer<typeof mouldChanges>,
  ) {
    return this.commandBus.execute(
      new UpdateMouldCommand(user.id, id, changes, idempotencyKey),
    );
  }
}

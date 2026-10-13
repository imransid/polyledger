import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';
import {
  type AuthUser,
  CurrentUser,
  IdempotencyKey,
  Roles,
} from '../auth/decorators.js';
import { activeFilter, found, listQuery } from '../common/list-query.js';
import {
  codeSchema,
  MASTER_DATA_EDITORS,
  MASTER_DATA_READERS,
  nameSchema,
} from '../common/master-data.js';
import { LocationKind } from '../generated/prisma/client.js';
import { CreateLocationCommand } from './commands/create-location.js';
import { UpdateLocationCommand } from './commands/update-location.js';
import { GetLocationQuery } from './queries/get-location.js';
import { ListLocationsQuery } from './queries/list-locations.js';

const locationBody = z.object({
  code: codeSchema,
  name: nameSchema,
  kind: z.enum(LocationKind),
});

const locationChanges = z.object({ name: nameSchema }).partial().strict();

const locationList = listQuery.extend({
  active: activeFilter,
  kind: z.enum(LocationKind).optional(),
});

@Roles(...MASTER_DATA_READERS)
@Controller('locations')
export class LocationsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(@Query({ schema: locationList }) query: z.infer<typeof locationList>) {
    return this.queryBus.execute(new ListLocationsQuery(query));
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return found(
      await this.queryBus.execute(new GetLocationQuery(id)),
      'Location',
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: locationBody }) body: z.infer<typeof locationBody>,
  ) {
    return this.commandBus.execute(
      new CreateLocationCommand(user.id, body, idempotencyKey),
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: locationChanges }) changes: z.infer<typeof locationChanges>,
  ) {
    return this.commandBus.execute(
      new UpdateLocationCommand(user.id, id, changes, idempotencyKey),
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Post(':id/deactivate')
  @HttpCode(200)
  deactivate(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new UpdateLocationCommand(
        user.id,
        id,
        { isActive: false },
        idempotencyKey,
      ),
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Post(':id/reactivate')
  @HttpCode(200)
  reactivate(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new UpdateLocationCommand(
        user.id,
        id,
        { isActive: true },
        idempotencyKey,
      ),
    );
  }
}

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
  gramsSchema,
  MASTER_DATA_EDITORS,
  MASTER_DATA_READERS,
  nameSchema,
} from '../common/master-data.js';
import { RawMaterialType } from '../generated/prisma/client.js';
import { CreateRawMaterialCommand } from './commands/create-raw-material.js';
import { UpdateRawMaterialCommand } from './commands/update-raw-material.js';
import { GetRawMaterialsQuery } from './queries/get-raw-materials.js';
import { ListRawMaterialsQuery } from './queries/list-raw-materials.js';

const rawMaterialBody = z.object({
  code: codeSchema,
  name: nameSchema,
  type: z.enum(RawMaterialType),
  minimumStockGrams: gramsSchema,
});

const rawMaterialChanges = rawMaterialBody
  .omit({ code: true })
  .partial()
  .strict();

const rawMaterialList = listQuery.extend({
  active: activeFilter,
  type: z.enum(RawMaterialType).optional(),
});

@Roles(...MASTER_DATA_READERS)
@Controller('raw-materials')
export class RawMaterialsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(
    @Query({ schema: rawMaterialList }) query: z.infer<typeof rawMaterialList>,
  ) {
    return this.queryBus.execute(new ListRawMaterialsQuery(query));
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const [material] = await this.queryBus.execute(
      new GetRawMaterialsQuery([id]),
    );
    return found(material, 'Raw material');
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: rawMaterialBody }) body: z.infer<typeof rawMaterialBody>,
  ) {
    return this.commandBus.execute(
      new CreateRawMaterialCommand(user.id, body, idempotencyKey),
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: rawMaterialChanges })
    changes: z.infer<typeof rawMaterialChanges>,
  ) {
    return this.commandBus.execute(
      new UpdateRawMaterialCommand(user.id, id, changes, idempotencyKey),
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
      new UpdateRawMaterialCommand(
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
      new UpdateRawMaterialCommand(
        user.id,
        id,
        { isActive: true },
        idempotencyKey,
      ),
    );
  }
}

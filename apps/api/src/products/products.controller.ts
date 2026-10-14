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
import { productResponse } from './responses.js';
import { ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import {
  ALL_ROLES,
  type AuthUser,
  CurrentUser,
  IdempotencyKey,
  Roles,
} from '../auth/decorators.js';
import {
  activeFilter,
  found,
  listQuery,
  pageOf,
} from '../common/list-query.js';
import {
  codeSchema,
  countSchema,
  MASTER_DATA_EDITORS,
  nameSchema,
} from '../common/master-data.js';
import { CreateProductCommand } from './commands/create-product.js';
import { UpdateProductCommand } from './commands/update-product.js';
import { GetProductQuery } from './queries/get-product.js';
import { ListProductsQuery } from './queries/list-products.js';

const productBody = z.object({
  code: codeSchema,
  name: nameSchema,
  pieceWeightMg: countSchema,
  colour: z.string().trim().min(1).max(50),
  piecesPerCarton: countSchema,
});

const productChanges = productBody.omit({ code: true }).partial().strict();

const productList = listQuery.extend({ active: activeFilter });

// Operators read products too: job cards on the tablet show them.
@Roles(...ALL_ROLES)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOkResponse({ standardSchema: pageOf(productResponse) })
  list(@Query({ schema: productList }) query: z.infer<typeof productList>) {
    return this.queryBus.execute(new ListProductsQuery(query));
  }

  @Get(':id')
  @ApiOkResponse({ standardSchema: productResponse })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return found(
      await this.queryBus.execute(new GetProductQuery(id)),
      'Product',
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Post()
  @ApiCreatedResponse({ standardSchema: productResponse })
  create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: productBody }) body: z.infer<typeof productBody>,
  ) {
    return this.commandBus.execute(
      new CreateProductCommand(user.id, body, idempotencyKey),
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Patch(':id')
  @ApiOkResponse({ standardSchema: productResponse })
  update(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: productChanges }) changes: z.infer<typeof productChanges>,
  ) {
    return this.commandBus.execute(
      new UpdateProductCommand(user.id, id, changes, idempotencyKey),
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Post(':id/deactivate')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: productResponse })
  deactivate(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new UpdateProductCommand(
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
  @ApiOkResponse({ standardSchema: productResponse })
  reactivate(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new UpdateProductCommand(user.id, id, { isActive: true }, idempotencyKey),
    );
  }
}

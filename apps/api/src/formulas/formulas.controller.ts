import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  type AuthUser,
  CurrentUser,
  IdempotencyKey,
  Roles,
} from '../auth/decorators.js';
import { found } from '../common/list-query.js';
import {
  MASTER_DATA_EDITORS,
  MASTER_DATA_READERS,
} from '../common/master-data.js';
import { ActivateFormulaVersionCommand } from './commands/activate-formula-version.js';
import { CreateFormulaVersionCommand } from './commands/create-formula-version.js';
import { formulaSchema, type NewFormulaVersion } from './domain/formula.js';
import { GetFormulaVersionQuery } from './queries/get-formula-version.js';
import { ListFormulaVersionsQuery } from './queries/list-formula-versions.js';

@Roles(...MASTER_DATA_READERS)
@Controller()
export class FormulasController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('products/:productId/formulas')
  list(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.queryBus.execute(new ListFormulaVersionsQuery(productId));
  }

  @Get('formulas/:id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return found(
      await this.queryBus.execute(new GetFormulaVersionQuery(id)),
      'Formula version',
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Post('products/:productId/formulas')
  create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body({ schema: formulaSchema }) formula: NewFormulaVersion,
  ) {
    return this.commandBus.execute(
      new CreateFormulaVersionCommand(
        user.id,
        productId,
        formula,
        idempotencyKey,
      ),
    );
  }

  @Roles(...MASTER_DATA_EDITORS)
  @Post('formulas/:id/activate')
  @HttpCode(200)
  activate(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new ActivateFormulaVersionCommand(user.id, id, idempotencyKey),
    );
  }
}

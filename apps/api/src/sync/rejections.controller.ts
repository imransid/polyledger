import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiNoContentResponse, ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';
import {
  type AuthUser,
  CurrentUser,
  IdempotencyKey,
  Roles,
} from '../auth/decorators.js';
import { listQuery, pageOf } from '../common/list-query.js';
import {
  type ReviewOutcome,
  ReviewRecordCommand,
} from './commands/review-record.js';
import { ListRejectionsQuery } from './queries/list-rejections.js';
import { rejectionResponse } from './responses.js';
import { RECORD_REVIEWERS } from './roles.js';

const rejectionList = listQuery.omit({ search: true }).extend({
  status: z.enum(['REJECTED', 'RESOLVED', 'DISMISSED']).optional(),
});

const noteBody = z.object({ note: z.string().trim().min(1).max(300) });

// Records tablets sent that the server refused, for a supervisor to settle.
@Roles(...RECORD_REVIEWERS)
@Controller('sync/rejections')
export class RejectionsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOkResponse({ standardSchema: pageOf(rejectionResponse) })
  list(@Query({ schema: rejectionList }) query: z.infer<typeof rejectionList>) {
    return this.queryBus.execute(new ListRejectionsQuery(query));
  }

  /** Settled, for example by recording the entry in the office. */
  @Post(':id/resolve')
  @HttpCode(204)
  @ApiNoContentResponse()
  async resolve(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: noteBody }) body: z.infer<typeof noteBody>,
  ) {
    await this.review(user, id, 'RESOLVED', body.note, idempotencyKey);
  }

  /** Not needed after all, for example a record made twice. */
  @Post(':id/dismiss')
  @HttpCode(204)
  @ApiNoContentResponse()
  async dismiss(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: noteBody }) body: z.infer<typeof noteBody>,
  ) {
    await this.review(user, id, 'DISMISSED', body.note, idempotencyKey);
  }

  private review(
    user: AuthUser,
    id: string,
    outcome: ReviewOutcome,
    note: string,
    idempotencyKey: string | undefined,
  ) {
    return this.commandBus.execute(
      new ReviewRecordCommand(user.id, id, outcome, note, idempotencyKey),
    );
  }
}

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
import { z } from 'zod';
import {
  ALL_ROLES,
  type AuthUser,
  CurrentUser,
  IdempotencyKey,
  Roles,
} from '../auth/decorators.js';
import { found, listQuery } from '../common/list-query.js';
import { countSchema } from '../common/master-data.js';
import {
  INT_MAX,
  kilogramsSchema,
  piecesSchema,
} from '../common/quantities.js';
import { JobCardStatus, Shift, WasteType } from '../generated/prisma/client.js';
import { CancelJobCardCommand } from './commands/cancel-job-card.js';
import { CloseJobCardCommand } from './commands/close-job-card.js';
import { CreateJobCardCommand } from './commands/create-job-card.js';
import { HandOverGoodsCommand } from './commands/hand-over-goods.js';
import { IssueMaterialCommand } from './commands/issue-material.js';
import { RecordProductionCommand } from './commands/record-production.js';
import { RecordWasteCommand } from './commands/record-waste.js';
import { ReleaseJobCardCommand } from './commands/release-job-card.js';
import { ReturnMaterialCommand } from './commands/return-material.js';
import { ReverseProductionEntryCommand } from './commands/reverse-production-entry.js';
import { ReverseWasteEntryCommand } from './commands/reverse-waste-entry.js';
import { StartJobCardCommand } from './commands/start-job-card.js';
import { StopJobCardCommand } from './commands/stop-job-card.js';
import { GetIssueSuggestionQuery } from './queries/get-issue-suggestion.js';
import { GetJobCardSummaryQuery } from './queries/get-job-card-summary.js';
import { GetJobCardQuery } from './queries/get-job-card.js';
import { ListJobCardsQuery } from './queries/list-job-cards.js';
import { ListProductionEntriesQuery } from './queries/list-production-entries.js';
import { ListWasteEntriesQuery } from './queries/list-waste-entries.js';
import {
  ENTRY_RECORDERS,
  FLOOR_LEADS,
  JOB_PLANNERS,
  PRODUCTION_READERS,
  STORE_STAFF,
} from './roles.js';

const jobCardBody = z.object({
  productId: z.uuid(),
  mouldId: z.uuid(),
  machineId: z.uuid(),
  floorLocationId: z.uuid(),
  plannedPieces: countSchema,
  plannedStartDate: z.iso.date(),
  salesOrderId: z.uuid().nullable().default(null),
});

const materialLines = z
  .array(z.object({ rawMaterialId: z.uuid(), kilograms: kilogramsSchema }))
  .min(1)
  .refine(
    (lines) =>
      new Set(lines.map((line) => line.rawMaterialId)).size === lines.length,
    'Each raw material can appear only once',
  )
  .refine(
    (lines) => lines.every((line) => line.kilograms > 0),
    'Quantities must be more than zero',
  )
  .transform((lines) =>
    lines.map((line) => ({
      rawMaterialId: line.rawMaterialId,
      grams: line.kilograms,
    })),
  );

const issueBody = z.object({ fromLocationId: z.uuid(), lines: materialLines });

const returnBody = z.object({ toLocationId: z.uuid(), lines: materialLines });

const handoverBody = z.object({
  toLocationId: z.uuid(),
  pieces: countSchema,
});

const shotCounter = z.number().int().min(0).max(INT_MAX);

const shiftDate = z.iso
  .date()
  .describe(
    'The date the shift started. Night shift C keeps its start date, even after midnight.',
  );

const entryBody = z
  .object({
    shiftDate,
    shift: z.enum(Shift),
    operatorId: z.uuid(),
    shotStart: shotCounter,
    shotEnd: shotCounter,
    goodPieces: piecesSchema,
    rejectedPieces: piecesSchema,
  })
  .refine((entry) => entry.shotEnd >= entry.shotStart, {
    message: 'The shot counter end cannot be before its start',
    path: ['shotEnd'],
  });

const wasteBody = z.object({
  shiftDate,
  shift: z.enum(Shift),
  wasteMaterialId: z.uuid(),
  scrapLocationId: z.uuid(),
  lines: z
    .array(
      z.object({ wasteType: z.enum(WasteType), kilograms: kilogramsSchema }),
    )
    .min(1)
    .refine(
      (lines) =>
        new Set(lines.map((line) => line.wasteType)).size === lines.length,
      'Each waste type can appear only once',
    )
    .refine(
      (lines) => lines.every((line) => line.kilograms > 0),
      'Weights must be more than zero',
    )
    // All of it lands on one ledger row at the scrap yard.
    .refine(
      (lines) =>
        lines.reduce((sum, line) => sum + line.kilograms, 0) <= INT_MAX,
      'The total weight is too large',
    )
    .transform((lines) =>
      lines.map((line) => ({
        wasteType: line.wasteType,
        grams: line.kilograms,
      })),
    ),
});

const reasonBody = z.object({ reason: z.string().trim().min(1).max(300) });

const jobCardList = listQuery.extend({
  status: z.enum(JobCardStatus).optional(),
  machineId: z.uuid().optional(),
  productId: z.uuid().optional(),
  salesOrderId: z.uuid().optional(),
});

// Operators may read job cards so the tablet can pick one; everything else
// is limited per action below.
@Roles(...ALL_ROLES)
@Controller('job-cards')
export class JobCardsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  list(@Query({ schema: jobCardList }) query: z.infer<typeof jobCardList>) {
    return this.queryBus.execute(new ListJobCardsQuery(query));
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return found(
      await this.queryBus.execute(new GetJobCardQuery(id)),
      'Job card',
    );
  }

  @Roles(...PRODUCTION_READERS)
  @Get(':id/summary')
  async summary(@Param('id', ParseUUIDPipe) id: string) {
    return found(
      await this.queryBus.execute(new GetJobCardSummaryQuery(id)),
      'Job card',
    );
  }

  @Roles(...PRODUCTION_READERS)
  @Get(':id/issue-suggestion')
  async issueSuggestion(@Param('id', ParseUUIDPipe) id: string) {
    return found(
      await this.queryBus.execute(new GetIssueSuggestionQuery(id)),
      'Job card',
    );
  }

  @Roles(...PRODUCTION_READERS)
  @Get(':id/entries')
  entries(@Param('id', ParseUUIDPipe) id: string) {
    return this.queryBus.execute(new ListProductionEntriesQuery(id));
  }

  @Roles(...PRODUCTION_READERS)
  @Get(':id/waste')
  waste(@Param('id', ParseUUIDPipe) id: string) {
    return this.queryBus.execute(new ListWasteEntriesQuery(id));
  }

  @Roles(...JOB_PLANNERS)
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Body({ schema: jobCardBody }) body: z.infer<typeof jobCardBody>,
  ) {
    return this.commandBus.execute(
      new CreateJobCardCommand(user.id, body, idempotencyKey),
    );
  }

  @Roles(...JOB_PLANNERS)
  @Post(':id/release')
  @HttpCode(200)
  release(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new ReleaseJobCardCommand(user.id, id, idempotencyKey),
    );
  }

  @Roles(...FLOOR_LEADS)
  @Post(':id/start')
  @HttpCode(200)
  start(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new StartJobCardCommand(user.id, id, idempotencyKey),
    );
  }

  @Roles(...FLOOR_LEADS)
  @Post(':id/stop')
  @HttpCode(200)
  stop(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new StopJobCardCommand(user.id, id, idempotencyKey),
    );
  }

  @Roles(...JOB_PLANNERS)
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: reasonBody }) body: z.infer<typeof reasonBody>,
  ) {
    return this.commandBus.execute(
      new CancelJobCardCommand(user.id, id, body.reason, idempotencyKey),
    );
  }

  @Roles(...JOB_PLANNERS)
  @Post(':id/close')
  @HttpCode(200)
  close(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.commandBus.execute(
      new CloseJobCardCommand(user.id, id, idempotencyKey),
    );
  }

  @Roles(...STORE_STAFF)
  @Post(':id/issues')
  issue(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: issueBody }) body: z.infer<typeof issueBody>,
  ) {
    return this.commandBus.execute(
      new IssueMaterialCommand(
        user.id,
        id,
        body.fromLocationId,
        body.lines,
        idempotencyKey,
      ),
    );
  }

  @Roles(...STORE_STAFF)
  @Post(':id/handovers')
  handOver(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: handoverBody }) body: z.infer<typeof handoverBody>,
  ) {
    return this.commandBus.execute(
      new HandOverGoodsCommand(
        user.id,
        id,
        body.toLocationId,
        body.pieces,
        idempotencyKey,
      ),
    );
  }

  @Roles(...STORE_STAFF)
  @Post(':id/returns')
  returnMaterial(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: returnBody }) body: z.infer<typeof returnBody>,
  ) {
    return this.commandBus.execute(
      new ReturnMaterialCommand(
        user.id,
        id,
        body.toLocationId,
        body.lines,
        idempotencyKey,
      ),
    );
  }

  /**
   * Records one shift. `shiftDate` is the date the shift started: night
   * shift C keeps its start date even after midnight. One entry per job
   * card, date and shift; reverse it to record it again.
   */
  @Roles(...ENTRY_RECORDERS)
  @Post(':id/entries')
  recordProduction(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: entryBody }) body: z.infer<typeof entryBody>,
  ) {
    return this.commandBus.execute(
      new RecordProductionCommand(user, id, body, idempotencyKey),
    );
  }

  @Roles(...FLOOR_LEADS)
  @Post(':id/entries/:entryId/reverse')
  reverseEntry(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body({ schema: reasonBody }) body: z.infer<typeof reasonBody>,
  ) {
    return this.commandBus.execute(
      new ReverseProductionEntryCommand(
        user.id,
        id,
        entryId,
        body.reason,
        idempotencyKey,
      ),
    );
  }

  /**
   * Weighed waste for one shift, into one REGRIND material at a scrap yard.
   * Purge and sweepings also take raw material off the floor by the card's
   * formula. One waste entry per job card, date and shift; reverse it to
   * record it again.
   */
  @Roles(...ENTRY_RECORDERS)
  @Post(':id/waste')
  recordWaste(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: wasteBody }) body: z.infer<typeof wasteBody>,
  ) {
    return this.commandBus.execute(
      new RecordWasteCommand(user.id, id, body, idempotencyKey),
    );
  }

  @Roles(...FLOOR_LEADS)
  @Post(':id/waste/:entryId/reverse')
  reverseWaste(
    @CurrentUser() user: AuthUser,
    @IdempotencyKey() idempotencyKey: string | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body({ schema: reasonBody }) body: z.infer<typeof reasonBody>,
  ) {
    return this.commandBus.execute(
      new ReverseWasteEntryCommand(
        user.id,
        id,
        entryId,
        body.reason,
        idempotencyKey,
      ),
    );
  }
}

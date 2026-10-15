import { HttpException } from '@nestjs/common';
import {
  Command,
  CommandBus,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { GetUserQuery } from '../../auth/queries/get-user.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { DeviceSession, Prisma } from '../../generated/prisma/client.js';
import { RecordProductionCommand } from '../../production/commands/record-production.js';
import { RecordWasteCommand } from '../../production/commands/record-waste.js';
import type { PairedDevice } from '../device.guard.js';
import { lateRecordProblem } from '../domain/sessions.js';
import {
  PUSHED_TABLES,
  type PushedTable,
  readRecord,
  type TabletEntry,
  wasteLines,
} from '../infra/records.js';
import { outcomeOf, type RecordOutcome } from '../infra/views.js';
import { TABLET_RECORDERS } from '../roles.js';

/** As the tablet sent it: only the id is sure to be there. */
export type RawRecord = { id: string } & Record<string, unknown>;

export type PushedChanges = Partial<
  Record<
    PushedTable,
    { created: RawRecord[]; updated: RawRecord[]; deleted: string[] }
  >
>;

export interface PushResult {
  accepted: string[];
  rejected: { id: string; table: string; reason: string }[];
}

const ONLY_NEW = 'Tablets only add records; correct them in the office';

/** WatermelonDB's push: the entries a tablet made while offline. */
export class PushRecordsCommand extends Command<PushResult> {
  constructor(
    readonly device: PairedDevice,
    readonly changes: PushedChanges,
  ) {
    super();
  }
}

// Each record stands on its own: one refused doesn't hold up the rest. It
// is posted through the same command as in the office, at server time, by
// whoever signed in for it. A refusal is kept with its reason for review,
// and the same record sent again gets the same answer. A server error
// fails the whole push, so the tablet tries again later.
@CommandHandler(PushRecordsCommand)
export class PushRecordsHandler implements ICommandHandler<PushRecordsCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({ device, changes }: PushRecordsCommand): Promise<PushResult> {
    const result: PushResult = { accepted: [], rejected: [] };
    for (const table of Object.keys(PUSHED_TABLES) as PushedTable[]) {
      const { created = [], updated = [], deleted = [] } = changes[table] ?? {};
      for (const id of [...updated.map((record) => record.id), ...deleted]) {
        result.rejected.push({ id, table, reason: ONLY_NEW });
      }
      // In the tablet's order: a shift's counter follows the one before.
      for (const record of created) {
        const outcome = await this.receive(device, table, record);
        if ('accepted' in outcome) {
          result.accepted.push(outcome.accepted);
        } else {
          result.rejected.push(outcome.rejected);
        }
      }
    }
    return result;
  }

  private async receive(
    device: PairedDevice,
    table: PushedTable,
    raw: RawRecord,
  ): Promise<RecordOutcome> {
    const known = await this.prisma.syncedRecord.findUnique({
      where: { id: raw.id },
    });
    if (known) {
      return known.deviceId === device.id
        ? outcomeOf(known, table)
        : {
            rejected: {
              id: raw.id,
              table,
              reason: 'Another tablet already sent a record with this id',
            },
          };
    }

    const receivedAt = new Date();
    const entry = readRecord(table, raw);
    const session =
      typeof entry === 'string'
        ? null
        : await this.prisma.deviceSession.findFirst({
            where: { id: entry.record.session_id, deviceId: device.id },
          });
    const reason =
      typeof entry === 'string'
        ? entry
        : !session
          ? 'Not signed in on this tablet'
          : (lateRecordProblem(
              session,
              new Date(entry.record.recorded_at),
              receivedAt,
            ) ?? (await this.post(entry, session)));

    const stored = await this.prisma.$transaction(async (tx) => {
      const record = await tx.syncedRecord.create({
        data: {
          id: raw.id,
          kind: PUSHED_TABLES[table],
          deviceId: device.id,
          sessionId: session?.id,
          recordedById: session?.userId,
          jobCardId:
            typeof entry === 'string' ? null : entry.record.job_card_id,
          payload: raw as Prisma.InputJsonObject,
          deviceRecordedAt:
            typeof entry === 'string'
              ? null
              : new Date(entry.record.recorded_at),
          receivedAt,
          status: reason ? 'REJECTED' : 'ACCEPTED',
          reason,
        },
      });
      if (reason) {
        await recordEvent(tx, 'sync.record_rejected', {
          recordId: record.id,
          deviceId: device.id,
          reason,
        });
      }
      return record;
    });
    return outcomeOf(stored, table);
  }

  /** Null once posted, or the refusal in the API's own words. */
  private async post(
    entry: TabletEntry,
    session: DeviceSession,
  ): Promise<string | null> {
    const user = await this.queryBus.execute(new GetUserQuery(session.userId));
    if (!user?.isActive || !TABLET_RECORDERS.includes(user.role)) {
      return `${user?.name ?? 'This user'} can no longer record on tablets`;
    }
    const { record } = entry;
    const fields = { shiftDate: record.shift_date, shift: record.shift };
    try {
      if (entry.kind === 'PRODUCTION_ENTRY') {
        const production = entry.record;
        await this.commandBus.execute(
          new RecordProductionCommand(
            { id: user.id, role: user.role, sessionId: session.id },
            record.job_card_id,
            {
              ...fields,
              operatorId: production.operator_id,
              shotStart: production.shot_start,
              shotEnd: production.shot_end,
              goodPieces: production.good_pieces,
              rejectedPieces: production.rejected_pieces,
            },
            undefined,
            record.id,
          ),
        );
      } else {
        const waste = entry.record;
        await this.commandBus.execute(
          new RecordWasteCommand(
            user.id,
            record.job_card_id,
            {
              ...fields,
              wasteMaterialId: waste.waste_material_id,
              scrapLocationId: waste.scrap_location_id,
              lines: wasteLines(waste),
            },
            undefined,
            record.id,
          ),
        );
      }
      return null;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        return error.message;
      }
      throw error;
    }
  }
}

import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  SyncRecordKind,
  SyncRecordStatus,
} from '../../generated/prisma/client.js';
import { GetJobCardQuery } from '../../production/queries/get-job-card.js';

export interface ChangedRejection {
  id: string;
  kind: SyncRecordKind;
  status: SyncRecordStatus;
  reason: string;
  jobCardId: string | null;
  jobCardNumber: string | null;
  deviceRecordedAt: Date | null;
}

/** One tablet's refused records, refused or reviewed at or after `since`. */
export class ListChangedRejectionsQuery extends Query<ChangedRejection[]> {
  constructor(
    readonly deviceId: string,
    readonly since: Date | null,
  ) {
    super();
  }
}

@QueryHandler(ListChangedRejectionsQuery)
export class ListChangedRejectionsHandler implements IQueryHandler<ListChangedRejectionsQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({
    deviceId,
    since,
  }: ListChangedRejectionsQuery): Promise<ChangedRejection[]> {
    const records = await this.prisma.syncedRecord.findMany({
      where: {
        deviceId,
        status: { not: 'ACCEPTED' },
        ...(since && {
          OR: [{ receivedAt: { gte: since } }, { reviewedAt: { gte: since } }],
        }),
      },
      orderBy: { receivedAt: 'asc' },
    });
    const cardIds = [
      ...new Set(records.flatMap((record) => record.jobCardId ?? [])),
    ];
    const cards = await Promise.all(
      cardIds.map((id) => this.queryBus.execute(new GetJobCardQuery(id))),
    );
    const cardNumber = new Map(
      cards.flatMap((card) => (card ? [[card.id, card.number] as const] : [])),
    );
    return records.map((record) => ({
      id: record.id,
      kind: record.kind,
      status: record.status,
      reason: record.reason!,
      jobCardId: record.jobCardId,
      jobCardNumber: record.jobCardId
        ? (cardNumber.get(record.jobCardId) ?? null)
        : null,
      deviceRecordedAt: record.deviceRecordedAt,
    }));
  }
}

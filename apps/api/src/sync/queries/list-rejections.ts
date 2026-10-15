import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { GetUserNamesQuery } from '../../auth/queries/get-user-names.js';
import {
  type ListQuery,
  type Page,
  pageArgs,
} from '../../common/list-query.js';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  Prisma,
  SyncRecordKind,
  SyncRecordStatus,
} from '../../generated/prisma/client.js';
import { GetJobCardQuery } from '../../production/queries/get-job-card.js';

export interface Rejection {
  id: string;
  kind: SyncRecordKind;
  status: SyncRecordStatus;
  reason: string;
  deviceId: string;
  deviceName: string;
  recordedByName: string | null;
  jobCardId: string | null;
  jobCardNumber: string | null;
  /** As the tablet sent it. */
  payload: Prisma.JsonValue;
  deviceRecordedAt: Date | null;
  receivedAt: Date;
  reviewedByName: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
}

export interface RejectionFilter extends Omit<ListQuery, 'search'> {
  status?: Exclude<SyncRecordStatus, 'ACCEPTED'>;
}

/** Records the server refused, newest first; all of them without a status. */
export class ListRejectionsQuery extends Query<Page<Rejection>> {
  constructor(readonly filter: RejectionFilter) {
    super();
  }
}

@QueryHandler(ListRejectionsQuery)
export class ListRejectionsHandler implements IQueryHandler<ListRejectionsQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({ filter }: ListRejectionsQuery): Promise<Page<Rejection>> {
    const where: Prisma.SyncedRecordWhereInput = {
      status: filter.status ?? { not: 'ACCEPTED' },
    };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.syncedRecord.findMany({
        where,
        include: { device: { select: { name: true } } },
        orderBy: { receivedAt: 'desc' },
        ...pageArgs(filter),
      }),
      this.prisma.syncedRecord.count({ where }),
    ]);
    const people = records.flatMap((record) =>
      [record.recordedById, record.reviewedById].filter((id) => id !== null),
    );
    const cardIds = [
      ...new Set(records.flatMap((record) => record.jobCardId ?? [])),
    ];
    const [names, cards] = await Promise.all([
      this.queryBus.execute(new GetUserNamesQuery([...new Set(people)])),
      Promise.all(
        cardIds.map((id) => this.queryBus.execute(new GetJobCardQuery(id))),
      ),
    ]);
    const cardNumber = new Map(
      cards.flatMap((card) => (card ? [[card.id, card.number] as const] : [])),
    );
    const name = (id: string | null) => (id ? (names.get(id) ?? null) : null);

    return {
      items: records.map((record) => ({
        id: record.id,
        kind: record.kind,
        status: record.status,
        reason: record.reason!,
        deviceId: record.deviceId,
        deviceName: record.device.name,
        recordedByName: name(record.recordedById),
        jobCardId: record.jobCardId,
        jobCardNumber: record.jobCardId
          ? (cardNumber.get(record.jobCardId) ?? null)
          : null,
        payload: record.payload,
        deviceRecordedAt: record.deviceRecordedAt,
        receivedAt: record.receivedAt,
        reviewedByName: name(record.reviewedById),
        reviewedAt: record.reviewedAt,
        reviewNote: record.reviewNote,
      })),
      total,
      page: filter.page,
      pageSize: filter.pageSize,
    };
  }
}

import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { ListPendingGatePassesQuery } from '../../dispatch/queries/list-pending-gate-passes.js';
import { minutesWaiting, waitedTooLong } from '../domain/figures.js';

export interface WaitingChallan {
  id: string;
  number: string;
  customerCode: string;
  customerName: string;
  vehicleNumber: string;
  /** Since the challan was posted. */
  waitingMinutes: number;
  waitedTooLong: boolean;
}

/** Oldest first. */
export class GetGateQueueQuery extends Query<WaitingChallan[]> {}

@QueryHandler(GetGateQueueQuery)
export class GetGateQueueHandler implements IQueryHandler<GetGateQueueQuery> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute(): Promise<WaitingChallan[]> {
    const now = new Date();
    const pending = await this.queryBus.execute(
      new ListPendingGatePassesQuery(),
    );
    return pending.map((challan) => {
      const waiting = minutesWaiting(challan.createdAt, now);
      return {
        id: challan.id,
        number: challan.number,
        customerCode: challan.customerCode,
        customerName: challan.customerName,
        vehicleNumber: challan.vehicleNumber,
        waitingMinutes: waiting,
        waitedTooLong: waitedTooLong(waiting),
      };
    });
  }
}

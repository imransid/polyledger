import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { factoryToday } from '../../common/dates.js';
import { basisPointsOf } from '../../common/quantities.js';
import { GetDayOutputQuery } from '../../production/queries/get-day-output.js';
import { GetMachineBoardQuery } from '../../production/queries/get-machine-board.js';

export interface TodayFigures {
  day: string;
  goodPieces: number;
  rejectedPieces: number;
  /** Rejected out of all pieces made: 2.35% is 235. */
  rejectBasisPoints: number | null;
  machines: { running: number; idle: number; repair: number };
}

export class GetTodayFiguresQuery extends Query<TodayFigures> {}

@QueryHandler(GetTodayFiguresQuery)
export class GetTodayFiguresHandler implements IQueryHandler<GetTodayFiguresQuery> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute(): Promise<TodayFigures> {
    const day = factoryToday();
    const [output, board] = await Promise.all([
      this.queryBus.execute(new GetDayOutputQuery(day)),
      this.queryBus.execute(new GetMachineBoardQuery()),
    ]);
    const inState = (state: string) =>
      board.filter((machine) => machine.state === state).length;
    return {
      day,
      ...output,
      rejectBasisPoints: basisPointsOf(
        output.rejectedPieces,
        output.goodPieces + output.rejectedPieces,
      ),
      machines: {
        running: inState('RUNNING'),
        idle: inState('IDLE'),
        repair: inState('REPAIR'),
      },
    };
  }
}

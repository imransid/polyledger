import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { factoryToday } from '../../common/dates.js';
import { basisPointsOf, toSafeNumber } from '../../common/quantities.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ListMachinesQuery } from '../../machines/queries/list-machines.js';
import { GetProductsQuery } from '../../products/queries/get-products.js';
import {
  boardOrder,
  type MachineState,
  machineState,
} from '../domain/machine-board.js';

export interface MachineOnBoard {
  machineId: string;
  code: string;
  name: string;
  state: MachineState;
  /** The job card running on it now, if any. */
  jobCard: {
    id: string;
    number: string;
    productId: string;
    productCode: string;
  } | null;
  /** Shifts that started today in Dhaka, on any card. */
  goodPiecesToday: number;
  rejectedPiecesToday: number;
  rejectBasisPointsToday: number | null;
}

export class GetMachineBoardQuery extends Query<MachineOnBoard[]> {}

@QueryHandler(GetMachineBoardQuery)
export class GetMachineBoardHandler implements IQueryHandler<GetMachineBoardQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(): Promise<MachineOnBoard[]> {
    const today = factoryToday();
    const [machines, running, made] = await Promise.all([
      this.queryBus.execute(new ListMachinesQuery({ page: 1, pageSize: 200 })),
      this.prisma.jobCard.findMany({ where: { status: 'RUNNING' } }),
      this.prisma.$queryRaw<
        { machineId: string; good: bigint; rejected: bigint }[]
      >`
        SELECT j.machine_id AS "machineId",
               SUM(e.good_pieces)::bigint AS good,
               SUM(e.rejected_pieces)::bigint AS rejected
        FROM production_entries e
        JOIN job_cards j ON j.id = e.job_card_id
        WHERE e.reversed_at IS NULL AND e.shift_date = ${today}::date
        GROUP BY j.machine_id`,
    ]);
    const products = await this.queryBus.execute(
      new GetProductsQuery(running.map((card) => card.productId)),
    );
    const productCode = new Map(products.map((p) => [p.id, p.code]));
    const cardOn = new Map(running.map((card) => [card.machineId, card]));
    const madeOn = new Map(made.map((row) => [row.machineId, row]));

    return machines.items
      .flatMap((machine) => {
        const card = cardOn.get(machine.id);
        const state = machineState(machine.status, card !== undefined);
        if (state === null) {
          return [];
        }
        const good = toSafeNumber(madeOn.get(machine.id)?.good ?? 0n);
        const rejected = toSafeNumber(madeOn.get(machine.id)?.rejected ?? 0n);
        return [
          {
            machineId: machine.id,
            code: machine.code,
            name: machine.name,
            state,
            jobCard: card
              ? {
                  id: card.id,
                  number: card.number,
                  productId: card.productId,
                  productCode: productCode.get(card.productId) ?? '',
                }
              : null,
            goodPiecesToday: good,
            rejectedPiecesToday: rejected,
            rejectBasisPointsToday: basisPointsOf(rejected, good + rejected),
          },
        ];
      })
      .sort(boardOrder);
  }
}

import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { ListChangedUsersQuery } from '../../auth/queries/list-changed-users.js';
import { ListChangedMachinesQuery } from '../../machines/queries/list-changed-machines.js';
import { ListChangedRawMaterialsQuery } from '../../materials/queries/list-changed-raw-materials.js';
import { ListChangedMouldsQuery } from '../../moulds/queries/list-changed-moulds.js';
import { ListChangedJobCardsQuery } from '../../production/queries/list-changed-job-cards.js';
import { ListChangedProductsQuery } from '../../products/queries/list-changed-products.js';
import { ListChangedLocationsQuery } from '../../stock/queries/list-changed-locations.js';
import type { PairedDevice } from '../device.guard.js';
import { changesOf } from '../domain/pull.js';
import { TABLET_RECORDERS } from '../roles.js';
import { ListChangedRejectionsQuery } from './list-changed-rejections.js';

/** WatermelonDB's pull: what changed since the last one, and when this one began. */
export class PullChangesQuery extends Query<{
  changes: Record<string, ReturnType<typeof changesOf>>;
  timestamp: number;
}> {
  constructor(
    readonly device: PairedDevice,
    /** Milliseconds, as the tablet got it from its last pull; null the first time. */
    readonly lastPulledAt: number | null,
  ) {
    super();
  }
}

// Only what the floor needs: its own job cards in work, the short lists a
// shift or waste entry picks from, who can sign in, and its own records
// still waiting for a supervisor.
@QueryHandler(PullChangesQuery)
export class PullChangesHandler implements IQueryHandler<PullChangesQuery> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute({ device, lastPulledAt }: PullChangesQuery) {
    // Taken before reading, so a change made while this pull runs comes
    // again next time rather than never.
    const timestamp = Date.now();
    const since = lastPulledAt === null ? null : new Date(lastPulledAt);
    const first = since === null;
    const [
      cards,
      products,
      moulds,
      machines,
      users,
      materials,
      locations,
      rejections,
    ] = await Promise.all([
      this.queryBus.execute(
        new ListChangedJobCardsQuery(device.floorLocationId, since),
      ),
      this.queryBus.execute(new ListChangedProductsQuery(since)),
      this.queryBus.execute(new ListChangedMouldsQuery(since)),
      this.queryBus.execute(new ListChangedMachinesQuery(since)),
      this.queryBus.execute(new ListChangedUsersQuery(since)),
      this.queryBus.execute(new ListChangedRawMaterialsQuery(since)),
      this.queryBus.execute(new ListChangedLocationsQuery(since)),
      this.queryBus.execute(new ListChangedRejectionsQuery(device.id, since)),
    ]);

    return {
      changes: {
        job_cards: changesOf(
          cards,
          first,
          (card) => card.status === 'RELEASED' || card.status === 'RUNNING',
          (card) => ({
            id: card.id,
            number: card.number,
            product_id: card.productId,
            mould_id: card.mouldId,
            machine_id: card.machineId,
            piece_weight_mg: card.pieceWeightMg,
            cavities: card.cavities,
            runner_weight_mg: card.runnerWeightMg,
            planned_pieces: card.plannedPieces,
            planned_start_date: card.plannedStartDate,
            status: card.status,
          }),
        ),
        products: changesOf(
          products,
          first,
          (product) => product.isActive,
          (product) => ({
            id: product.id,
            code: product.code,
            name: product.name,
            piece_weight_mg: product.pieceWeightMg,
            colour: product.colour,
          }),
        ),
        moulds: changesOf(
          moulds,
          first,
          (mould) => mould.status !== 'RETIRED',
          (mould) => ({
            id: mould.id,
            code: mould.code,
            name: mould.name,
            product_id: mould.productId,
            cavities: mould.cavities,
            status: mould.status,
          }),
        ),
        machines: changesOf(
          machines,
          first,
          (machine) => machine.status !== 'RETIRED',
          (machine) => ({
            id: machine.id,
            code: machine.code,
            name: machine.name,
            status: machine.status,
          }),
        ),
        operators: changesOf(
          users,
          first,
          (user) => user.isActive && user.role === 'OPERATOR',
          (user) => ({ id: user.id, name: user.name }),
        ),
        tablet_users: changesOf(
          users,
          first,
          (user) =>
            user.isActive &&
            user.hasPin &&
            TABLET_RECORDERS.includes(user.role),
          (user) => ({ id: user.id, name: user.name, role: user.role }),
        ),
        raw_materials: changesOf(
          materials,
          first,
          (material) => material.isActive && material.type === 'REGRIND',
          (material) => ({
            id: material.id,
            code: material.code,
            name: material.name,
          }),
        ),
        locations: changesOf(
          locations,
          first,
          (location) => location.isActive && location.kind === 'SCRAP_YARD',
          (location) => ({
            id: location.id,
            code: location.code,
            name: location.name,
          }),
        ),
        rejections: changesOf(
          rejections,
          first,
          (rejection) => rejection.status === 'REJECTED',
          (rejection) => ({
            id: rejection.id,
            kind: rejection.kind,
            job_card_id: rejection.jobCardId,
            job_card_number: rejection.jobCardNumber,
            reason: rejection.reason,
            recorded_at: rejection.deviceRecordedAt?.getTime() ?? null,
          }),
        ),
      },
      timestamp,
    };
  }
}

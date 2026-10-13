import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { StockLine } from '../domain/lines.js';
import { itemKey, loadItems } from '../infra/items.js';
import { type Movement, postDocument, withEntries } from '../infra/ledger.js';
import { assertStorable, loadLocations } from '../infra/locations.js';
import type { StockDocumentView } from '../queries/get-stock-document.js';

export interface NewAdjustment {
  locationId: string;
  reason: string;
  /** Counted quantities; the ledger gets the difference. */
  lines: StockLine[];
}

export class PostAdjustmentCommand extends Command<StockDocumentView> {
  constructor(
    readonly actorId: string,
    readonly adjustment: NewAdjustment,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(PostAdjustmentCommand)
export class PostAdjustmentHandler implements ICommandHandler<PostAdjustmentCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    adjustment,
    idempotencyKey,
  }: PostAdjustmentCommand): Promise<StockDocumentView> {
    const { locationId, reason, lines } = adjustment;

    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'PostAdjustment' },
        async () => {
          const locations = await loadLocations(tx, [locationId]);
          const items = await loadItems(this.queryBus, lines);
          const movements: Movement[] = lines.map((line) => ({
            item: items.get(itemKey(line))!,
            locationId,
            change: { to: line.quantity },
          }));
          assertStorable(movements, locations);

          const { document } = await postDocument(
            tx,
            { kind: 'ADJUSTMENT', postedById: actorId, reason },
            movements,
          );
          return tx.stockDocument.findUniqueOrThrow({
            where: { id: document.id },
            include: withEntries,
          });
        },
      ),
    );
  }
}

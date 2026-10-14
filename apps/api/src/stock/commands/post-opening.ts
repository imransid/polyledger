import { ConflictException } from '@nestjs/common';
import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { StockLine } from '../domain/lines.js';
import { assertActive, itemKey, loadItems } from '../infra/items.js';
import {
  lockBalances,
  type Movement,
  postDocument,
  withEntries,
} from '../infra/ledger.js';
import { assertStorable, loadLocations } from '../infra/locations.js';
import type { StockDocumentView } from '../queries/get-stock-document.js';

export interface NewOpening {
  locationId: string;
  /** Counted quantities. */
  lines: StockLine[];
}

export class PostOpeningCommand extends Command<StockDocumentView> {
  constructor(
    readonly actorId: string,
    readonly opening: NewOpening,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(PostOpeningCommand)
export class PostOpeningHandler implements ICommandHandler<PostOpeningCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    opening,
    idempotencyKey,
  }: PostOpeningCommand): Promise<StockDocumentView> {
    const { locationId, lines } = opening;

    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'PostOpening' },
        async () => {
          const locations = await loadLocations(tx, [locationId]);
          const items = await loadItems(this.queryBus, lines);
          assertActive(items.values());
          const movements: Movement[] = lines.map((line) => ({
            item: items.get(itemKey(line))!,
            locationId,
            change: { to: line.quantity },
          }));
          assertStorable(movements, locations);

          // Holding the balance locks makes the "only one opening" check safe
          // against a second opening posted at the same moment.
          await lockBalances(tx, movements);
          const existing = await tx.stockLedgerEntry.findFirst({
            where: {
              movementType: 'OPENING',
              locationId,
              OR: lines.map(({ itemType, itemId }) => ({ itemType, itemId })),
              document: { reversedAt: null },
            },
          });
          if (existing) {
            const item = items.get(itemKey(existing))!;
            throw new ConflictException(
              `${item.code} already has opening stock at ${locations.get(locationId)!.code}`,
            );
          }

          const { document } = await postDocument(
            tx,
            { kind: 'OPENING', postedById: actorId },
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

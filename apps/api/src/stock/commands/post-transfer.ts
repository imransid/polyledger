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

export interface NewTransfer {
  fromLocationId: string;
  toLocationId: string;
  lines: StockLine[];
}

export class PostTransferCommand extends Command<StockDocumentView> {
  constructor(
    readonly actorId: string,
    readonly transfer: NewTransfer,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(PostTransferCommand)
export class PostTransferHandler implements ICommandHandler<PostTransferCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    transfer,
    idempotencyKey,
  }: PostTransferCommand): Promise<StockDocumentView> {
    const { fromLocationId, toLocationId, lines } = transfer;

    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'PostTransfer' },
        async () => {
          const locations = await loadLocations(tx, [
            fromLocationId,
            toLocationId,
          ]);
          const items = await loadItems(this.queryBus, lines);
          const movements: Movement[] = lines.flatMap((line) => {
            const item = items.get(itemKey(line))!;
            return [
              {
                item,
                locationId: fromLocationId,
                change: { by: -line.quantity },
              },
              { item, locationId: toLocationId, change: { by: line.quantity } },
            ];
          });
          assertStorable(movements, locations);

          const { document } = await postDocument(
            tx,
            { kind: 'TRANSFER', postedById: actorId },
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

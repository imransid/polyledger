import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import type {
  Prisma,
  StockDocumentKind,
  StockItemType,
} from '../../generated/prisma/client.js';
import type { Change } from '../domain/balance.js';
import { itemKey, loadItems } from '../infra/items.js';
import { postDocument, withEntries } from '../infra/ledger.js';
import { assertStorable, loadLocations } from '../infra/locations.js';
import type { StockDocumentView } from '../queries/get-stock-document.js';

export interface StockDocumentLine {
  itemType: StockItemType;
  itemId: string;
  locationId: string;
  change: Change;
}

// For other modules whose own records must commit together with the ledger
// rows (a production entry and its backflush, say): it runs inside the
// caller's transaction instead of opening one.
export class PostStockDocumentCommand extends Command<StockDocumentView> {
  constructor(
    readonly tx: Prisma.TransactionClient,
    readonly header: {
      kind: StockDocumentKind;
      postedById: string;
      jobCardId?: string;
    },
    readonly lines: StockDocumentLine[],
  ) {
    super();
  }
}

@CommandHandler(PostStockDocumentCommand)
export class PostStockDocumentHandler implements ICommandHandler<PostStockDocumentCommand> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute({
    tx,
    header,
    lines,
  }: PostStockDocumentCommand): Promise<StockDocumentView> {
    const locations = await loadLocations(
      tx,
      lines.map((line) => line.locationId),
    );
    const items = await loadItems(this.queryBus, lines);
    const movements = lines.map((line) => ({
      item: items.get(itemKey(line))!,
      locationId: line.locationId,
      change: line.change,
    }));
    assertStorable(movements, locations);

    const { document } = await postDocument(tx, header, movements);
    return tx.stockDocument.findUniqueOrThrow({
      where: { id: document.id },
      include: withEntries,
    });
  }
}

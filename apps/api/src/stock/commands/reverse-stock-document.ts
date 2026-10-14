import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import type { Prisma } from '../../generated/prisma/client.js';
import { reverseDocument } from '../infra/reversal.js';
import type { StockDocumentView } from '../queries/get-stock-document.js';

// Like PostStockDocumentCommand: runs inside the caller's transaction, for
// modules that keep their own record of what is being reversed.
export class ReverseStockDocumentCommand extends Command<StockDocumentView> {
  constructor(
    readonly tx: Prisma.TransactionClient,
    readonly actorId: string,
    readonly documentId: string,
    readonly reason: string,
  ) {
    super();
  }
}

@CommandHandler(ReverseStockDocumentCommand)
export class ReverseStockDocumentHandler implements ICommandHandler<ReverseStockDocumentCommand> {
  constructor(private readonly queryBus: QueryBus) {}

  execute({
    tx,
    actorId,
    documentId,
    reason,
  }: ReverseStockDocumentCommand): Promise<StockDocumentView> {
    return reverseDocument(tx, this.queryBus, { actorId, documentId, reason });
  }
}

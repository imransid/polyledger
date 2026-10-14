import { ConflictException } from '@nestjs/common';
import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { StockDocumentKind } from '../../generated/prisma/client.js';
import { reverseDocument } from '../infra/reversal.js';
import type { StockDocumentView } from '../queries/get-stock-document.js';

// These have their own record next to the ledger rows (a production entry,
// a sale with prices), which must be reversed together with them.
const REVERSED_ELSEWHERE: Partial<Record<StockDocumentKind, string>> = {
  PRODUCTION: 'Production entries are reversed from their job card',
  WASTE: 'Waste entries are reversed from their job card',
  GRINDING: 'Grinding batches are reversed from scrap',
  SCRAP_SALE: 'Scrap sales are reversed from scrap',
  DISPATCH: 'Delivery challans are reversed from dispatch',
  CUSTOMER_RETURN: 'Customer returns are reversed from dispatch',
};

export class ReverseDocumentCommand extends Command<StockDocumentView> {
  constructor(
    readonly actorId: string,
    readonly documentId: string,
    readonly reason: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(ReverseDocumentCommand)
export class ReverseDocumentHandler implements ICommandHandler<ReverseDocumentCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  execute({
    actorId,
    documentId,
    reason,
    idempotencyKey,
  }: ReverseDocumentCommand): Promise<StockDocumentView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'ReverseDocument' },
        async () => {
          const document = await tx.stockDocument.findUnique({
            where: { id: documentId },
          });
          const elsewhere = document && REVERSED_ELSEWHERE[document.kind];
          if (elsewhere) {
            throw new ConflictException(elsewhere);
          }
          return reverseDocument(tx, this.queryBus, {
            actorId,
            documentId,
            reason,
          });
        },
      ),
    );
  }
}

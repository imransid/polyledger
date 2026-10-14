import { ConflictException } from '@nestjs/common';
import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { reverseDocument } from '../infra/reversal.js';
import type { StockDocumentView } from '../queries/get-stock-document.js';

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
          // Its production entry would no longer match the ledger.
          if (document?.kind === 'PRODUCTION') {
            throw new ConflictException(
              'Production entries are reversed from their job card',
            );
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

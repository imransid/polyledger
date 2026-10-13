import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { itemKey, loadItems } from '../infra/items.js';
import { postDocument, withEntries } from '../infra/ledger.js';
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
          // Locked so two people reversing the same document can't both win.
          const [locked] = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM stock_documents WHERE id = ${documentId}::uuid FOR UPDATE`;
          if (!locked) {
            throw new NotFoundException('Stock document not found');
          }
          const original = await tx.stockDocument.findUniqueOrThrow({
            where: { id: documentId },
            include: withEntries,
          });
          if (original.kind === 'REVERSAL') {
            throw new ConflictException('A reversal cannot be reversed');
          }
          if (original.reversedAt) {
            throw new ConflictException(
              `${original.number} is already reversed`,
            );
          }

          const items = await loadItems(this.queryBus, original.entries);
          const { document } = await postDocument(
            tx,
            {
              kind: 'REVERSAL',
              postedById: actorId,
              reason,
              reversesId: original.id,
            },
            original.entries.map((entry) => ({
              item: items.get(itemKey(entry))!,
              locationId: entry.locationId,
              change: { by: -(entry.pieces ?? entry.grams) },
              reversalOfId: entry.id,
            })),
          );
          await tx.stockDocument.update({
            where: { id: original.id },
            data: { reversedAt: document.postedAt },
          });
          return tx.stockDocument.findUniqueOrThrow({
            where: { id: document.id },
            include: withEntries,
          });
        },
      ),
    );
  }
}

import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { isUniqueViolation } from '../../database/errors.js';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { PrismaService } from '../../database/prisma.service.js';
import { GetSupplierQuery } from '../../suppliers/queries/get-supplier.js';
import { assertActive, itemKey, loadItems } from '../infra/items.js';
import { postDocument, withEntries } from '../infra/ledger.js';
import { loadLocations } from '../infra/locations.js';
import type { StockDocumentView } from '../queries/get-stock-document.js';

export interface NewReceipt {
  supplierId: string;
  supplierReference: string;
  receivedOn: string;
  locationId: string;
  lines: {
    rawMaterialId: string;
    challanGrams: number;
    receivedGrams: number;
  }[];
}

export class PostReceiptCommand extends Command<StockDocumentView> {
  constructor(
    readonly actorId: string,
    readonly receipt: NewReceipt,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(PostReceiptCommand)
export class PostReceiptHandler implements ICommandHandler<PostReceiptCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({
    actorId,
    receipt,
    idempotencyKey,
  }: PostReceiptCommand): Promise<StockDocumentView> {
    try {
      return await this.prisma.$transaction((tx) =>
        withIdempotencyKey(
          tx,
          { actorId, key: idempotencyKey, command: 'PostReceipt' },
          async () => {
            const supplier = await this.queryBus.execute(
              new GetSupplierQuery(receipt.supplierId),
            );
            if (!supplier?.isActive) {
              throw new BadRequestException('Supplier not found or inactive');
            }
            const locations = await loadLocations(tx, [receipt.locationId]);
            if (
              locations.get(receipt.locationId)!.kind !== 'RAW_MATERIAL_STORE'
            ) {
              throw new BadRequestException(
                'Goods receipts go into a raw material store',
              );
            }
            const refs = receipt.lines.map((line) => ({
              itemType: 'RAW_MATERIAL' as const,
              itemId: line.rawMaterialId,
            }));
            const items = await loadItems(this.queryBus, refs);
            assertActive(items.values());

            // Only what our scale showed goes into stock.
            const { document } = await postDocument(
              tx,
              {
                kind: 'RECEIPT',
                postedById: actorId,
                supplierId: receipt.supplierId,
                supplierReference: receipt.supplierReference,
                receivedOn: new Date(receipt.receivedOn),
              },
              receipt.lines
                .filter((line) => line.receivedGrams > 0)
                .map((line) => ({
                  item: items.get(
                    itemKey({
                      itemType: 'RAW_MATERIAL',
                      itemId: line.rawMaterialId,
                    }),
                  )!,
                  locationId: receipt.locationId,
                  change: { by: line.receivedGrams },
                })),
            );
            await tx.receiptLine.createMany({
              data: receipt.lines.map((line) => ({
                documentId: document.id,
                ...line,
              })),
            });
            return tx.stockDocument.findUniqueOrThrow({
              where: { id: document.id },
              include: withEntries,
            });
          },
        ),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          `Challan ${receipt.supplierReference} from this supplier is already received`,
        );
      }
      throw error;
    }
  }
}

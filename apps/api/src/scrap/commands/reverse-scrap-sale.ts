import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  Command,
  CommandBus,
  CommandHandler,
  type ICommandHandler,
} from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import { ReverseStockDocumentCommand } from '../../stock/commands/reverse-stock-document.js';
import { type ScrapSaleView, toScrapSaleView } from '../infra/views.js';

export class ReverseScrapSaleCommand extends Command<ScrapSaleView> {
  constructor(
    readonly actorId: string,
    readonly saleId: string,
    readonly reason: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// Puts the scrap back in the yard and drops the sale from the totals.
@CommandHandler(ReverseScrapSaleCommand)
export class ReverseScrapSaleHandler implements ICommandHandler<ReverseScrapSaleCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  execute({
    actorId,
    saleId,
    reason,
    idempotencyKey,
  }: ReverseScrapSaleCommand): Promise<ScrapSaleView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'ReverseScrapSale' },
        async () => {
          const { count } = await tx.scrapSale.updateMany({
            where: { id: saleId, reversedAt: null },
            data: { reversedAt: new Date() },
          });
          const sale = await tx.scrapSale.findUnique({
            where: { id: saleId },
            include: { lines: true },
          });
          if (!sale) {
            throw new NotFoundException('Scrap sale not found');
          }
          if (count === 0) {
            throw new ConflictException('This sale is already reversed');
          }

          await this.commandBus.execute(
            new ReverseStockDocumentCommand(
              tx,
              actorId,
              sale.stockDocumentId,
              reason,
            ),
          );
          await recordEvent(tx, 'scrap.sale_reversed', { saleId, reason });
          return toScrapSaleView(sale);
        },
      ),
    );
  }
}

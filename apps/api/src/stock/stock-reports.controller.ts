import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { z } from 'zod';
import { Roles } from '../auth/decorators.js';
import { found, listQuery } from '../common/list-query.js';
import {
  StockDocumentKind,
  StockItemType,
} from '../generated/prisma/client.js';
import { GetStockCardQuery } from './queries/get-stock-card.js';
import { GetStockDocumentQuery } from './queries/get-stock-document.js';
import { ListBalancesQuery } from './queries/list-balances.js';
import { ListLowStockQuery } from './queries/list-low-stock.js';
import { ListReceiptShortagesQuery } from './queries/list-receipt-shortages.js';
import { ListStockDocumentsQuery } from './queries/list-stock-documents.js';
import { STOCK_READERS } from './roles.js';

const documentList = listQuery.extend({
  kind: z.enum(StockDocumentKind).optional(),
});

const balanceList = listQuery.extend({
  itemType: z.enum(StockItemType).optional(),
  itemId: z.uuid().optional(),
  locationId: z.uuid().optional(),
});

const stockCard = listQuery.extend({
  itemType: z.enum(StockItemType),
  itemId: z.uuid(),
  locationId: z.uuid().optional(),
});

const shortageFilter = z.object({
  supplierId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

@Roles(...STOCK_READERS)
@Controller('stock')
export class StockReportsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('documents')
  listDocuments(
    @Query({ schema: documentList }) query: z.infer<typeof documentList>,
  ) {
    return this.queryBus.execute(new ListStockDocumentsQuery(query));
  }

  @Get('documents/:id')
  async getDocument(@Param('id', ParseUUIDPipe) id: string) {
    return found(
      await this.queryBus.execute(new GetStockDocumentQuery(id)),
      'Stock document',
    );
  }

  @Get('balances')
  balances(@Query({ schema: balanceList }) query: z.infer<typeof balanceList>) {
    return this.queryBus.execute(new ListBalancesQuery(query));
  }

  @Get('card')
  card(@Query({ schema: stockCard }) query: z.infer<typeof stockCard>) {
    return this.queryBus.execute(new GetStockCardQuery(query));
  }

  @Get('low-stock')
  lowStock() {
    return this.queryBus.execute(new ListLowStockQuery());
  }

  @Get('receipts/shortages')
  shortages(
    @Query({ schema: shortageFilter }) query: z.infer<typeof shortageFilter>,
  ) {
    return this.queryBus.execute(new ListReceiptShortagesQuery(query));
  }
}

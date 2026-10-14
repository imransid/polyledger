import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { Roles } from '../auth/decorators.js';
import { found, listQuery, pageOf } from '../common/list-query.js';
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
import {
  balanceResponse,
  documentDetailResponse,
  documentSummaryResponse,
  lowStockResponse,
  shortagesResponse,
  stockCardLineResponse,
} from './responses.js';
import { STOCK_READERS } from './roles.js';

const documentList = listQuery
  .extend({
    kind: z.enum(StockDocumentKind).optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'from cannot be after to',
    path: ['to'],
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
  @ApiOkResponse({ standardSchema: pageOf(documentSummaryResponse) })
  listDocuments(
    @Query({ schema: documentList }) query: z.infer<typeof documentList>,
  ) {
    return this.queryBus.execute(new ListStockDocumentsQuery(query));
  }

  @Get('documents/:id')
  @ApiOkResponse({ standardSchema: documentDetailResponse })
  async getDocument(@Param('id', ParseUUIDPipe) id: string) {
    return found(
      await this.queryBus.execute(new GetStockDocumentQuery(id)),
      'Stock document',
    );
  }

  @Get('balances')
  @ApiOkResponse({ standardSchema: pageOf(balanceResponse) })
  balances(@Query({ schema: balanceList }) query: z.infer<typeof balanceList>) {
    return this.queryBus.execute(new ListBalancesQuery(query));
  }

  @Get('card')
  @ApiOkResponse({ standardSchema: pageOf(stockCardLineResponse) })
  card(@Query({ schema: stockCard }) query: z.infer<typeof stockCard>) {
    return this.queryBus.execute(new GetStockCardQuery(query));
  }

  @Get('low-stock')
  @ApiOkResponse({ standardSchema: lowStockResponse })
  lowStock() {
    return this.queryBus.execute(new ListLowStockQuery());
  }

  @Get('receipts/shortages')
  @ApiOkResponse({ standardSchema: shortagesResponse })
  shortages(
    @Query({ schema: shortageFilter }) query: z.infer<typeof shortageFilter>,
  ) {
    return this.queryBus.execute(new ListReceiptShortagesQuery(query));
  }
}

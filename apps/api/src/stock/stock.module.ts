import { Module } from '@nestjs/common';
import { CreateLocationHandler } from './commands/create-location.js';
import { PostAdjustmentHandler } from './commands/post-adjustment.js';
import { PostOpeningHandler } from './commands/post-opening.js';
import { PostReceiptHandler } from './commands/post-receipt.js';
import { PostTransferHandler } from './commands/post-transfer.js';
import { ReverseDocumentHandler } from './commands/reverse-document.js';
import { UpdateLocationHandler } from './commands/update-location.js';
import { LocationsController } from './locations.controller.js';
import { GetLocationHandler } from './queries/get-location.js';
import { GetStockCardHandler } from './queries/get-stock-card.js';
import { GetStockDocumentHandler } from './queries/get-stock-document.js';
import { ListBalancesHandler } from './queries/list-balances.js';
import { ListLocationsHandler } from './queries/list-locations.js';
import { ListLowStockHandler } from './queries/list-low-stock.js';
import { ListReceiptShortagesHandler } from './queries/list-receipt-shortages.js';
import { ListStockDocumentsHandler } from './queries/list-stock-documents.js';
import { StockPostingsController } from './stock-postings.controller.js';
import { StockReportsController } from './stock-reports.controller.js';

@Module({
  controllers: [
    LocationsController,
    StockPostingsController,
    StockReportsController,
  ],
  providers: [
    CreateLocationHandler,
    UpdateLocationHandler,
    ListLocationsHandler,
    GetLocationHandler,
    PostReceiptHandler,
    PostTransferHandler,
    PostAdjustmentHandler,
    PostOpeningHandler,
    ReverseDocumentHandler,
    ListStockDocumentsHandler,
    GetStockDocumentHandler,
    ListBalancesHandler,
    GetStockCardHandler,
    ListLowStockHandler,
    ListReceiptShortagesHandler,
  ],
})
export class StockModule {}

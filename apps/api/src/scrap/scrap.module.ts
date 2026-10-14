import { Module } from '@nestjs/common';
import { GrindScrapHandler } from './commands/grind-scrap.js';
import { ReverseGrindingHandler } from './commands/reverse-grinding.js';
import { ReverseScrapSaleHandler } from './commands/reverse-scrap-sale.js';
import { ScrapProductsHandler } from './commands/scrap-products.js';
import { SellScrapHandler } from './commands/sell-scrap.js';
import { ListGrindingBatchesHandler } from './queries/list-grinding-batches.js';
import { ListScrapSalesHandler } from './queries/list-scrap-sales.js';
import { ScrapController } from './scrap.controller.js';

@Module({
  controllers: [ScrapController],
  providers: [
    ScrapProductsHandler,
    GrindScrapHandler,
    ReverseGrindingHandler,
    SellScrapHandler,
    ReverseScrapSaleHandler,
    ListGrindingBatchesHandler,
    ListScrapSalesHandler,
  ],
})
export class ScrapModule {}

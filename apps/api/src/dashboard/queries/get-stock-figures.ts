import {
  Query,
  QueryBus,
  QueryHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import {
  type FinishedGoodsStore,
  GetFinishedGoodsQuery,
} from '../../stock/queries/get-finished-goods.js';
import { ListLowStockQuery } from '../../stock/queries/list-low-stock.js';

export interface StockFigures {
  lowStockCount: number;
  finishedGoodsPieces: number;
  finishedGoodsStores: FinishedGoodsStore[];
}

export class GetStockFiguresQuery extends Query<StockFigures> {}

@QueryHandler(GetStockFiguresQuery)
export class GetStockFiguresHandler implements IQueryHandler<GetStockFiguresQuery> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute(): Promise<StockFigures> {
    const [lowStock, stores] = await Promise.all([
      this.queryBus.execute(new ListLowStockQuery()),
      this.queryBus.execute(new GetFinishedGoodsQuery()),
    ]);
    return {
      lowStockCount: lowStock.length,
      finishedGoodsPieces: stores.reduce((sum, store) => sum + store.pieces, 0),
      finishedGoodsStores: stores,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetActiveFormulasQuery } from '../../formulas/queries/get-active-formulas.js';
import { GetRawMaterialsQuery } from '../../materials/queries/get-raw-materials.js';
import { GetProductsQuery } from '../../products/queries/get-products.js';
import { GetStockTotalsQuery } from '../../stock/queries/get-stock-totals.js';
import {
  type MaterialNeed,
  type MaterialPlan,
  planMaterials,
} from '../domain/material-plan.js';

export interface NamedMaterialNeed extends MaterialNeed {
  code: string;
  name: string;
}

export interface MaterialCheck extends Omit<MaterialPlan, 'materials'> {
  materials: NamedMaterialNeed[];
}

// Gathers live stock, formulas and products from their own modules, then
// leaves the arithmetic to planMaterials.
@Injectable()
export class MaterialPlanner {
  constructor(private readonly queryBus: QueryBus) {}

  async plan(
    demand: { productId: string; pieces: number }[],
  ): Promise<MaterialCheck> {
    const productIds = demand.map((line) => line.productId);
    const [products, formulas, finishedGoods] = await Promise.all([
      this.queryBus.execute(new GetProductsQuery(productIds)),
      this.queryBus.execute(new GetActiveFormulasQuery(productIds)),
      this.queryBus.execute(
        new GetStockTotalsQuery('PRODUCT', productIds, 'FINISHED_GOODS_STORE'),
      ),
    ]);

    const materialIds = [
      ...new Set(
        formulas.flatMap((formula) =>
          formula.lines.map((line) => line.rawMaterialId),
        ),
      ),
    ];
    const [materials, materialStock] = await Promise.all([
      this.queryBus.execute(new GetRawMaterialsQuery(materialIds)),
      this.queryBus.execute(
        new GetStockTotalsQuery(
          'RAW_MATERIAL',
          materialIds,
          'RAW_MATERIAL_STORE',
        ),
      ),
    ]);

    const plan = planMaterials({
      demand,
      products: new Map(products.map((product) => [product.id, product])),
      finishedGoods: new Map(finishedGoods.map((t) => [t.itemId, t.pieces])),
      formulas: new Map(
        formulas.map((formula) => [formula.productId, formula]),
      ),
      materialStock: new Map(materialStock.map((t) => [t.itemId, t.grams])),
    });

    const names = new Map(materials.map((material) => [material.id, material]));
    return {
      ...plan,
      products: plan.products.sort((a, b) => a.code.localeCompare(b.code)),
      materials: plan.materials
        .map((need) => {
          const { code, name } = names.get(need.rawMaterialId)!;
          return { ...need, code, name };
        })
        .sort((a, b) => a.code.localeCompare(b.code)),
    };
  }
}

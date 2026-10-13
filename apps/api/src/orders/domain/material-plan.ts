import { grams, type Grams, requiredMaterial } from '@polyledger/shared';

export interface PlanInputs {
  /** Pieces ordered, one entry per product. */
  demand: { productId: string; pieces: number }[];
  products: Map<string, { code: string; pieceWeightMg: number }>;
  /** Pieces already in finished goods stores. */
  finishedGoods: Map<string, number>;
  formulas: Map<
    string,
    {
      version: number;
      wasteBasisPoints: number;
      lines: { rawMaterialId: string; basisPoints: number }[];
    }
  >;
  /** Grams in raw material stores. */
  materialStock: Map<string, Grams>;
}

export interface ProductPlan {
  productId: string;
  code: string;
  orderedPieces: number;
  fromStockPieces: number;
  toProducePieces: number;
  formulaVersion: number | null;
}

export interface MaterialNeed {
  rawMaterialId: string;
  neededGrams: Grams;
  availableGrams: Grams;
  shortageGrams: Grams;
}

export interface MaterialPlan {
  products: ProductPlan[];
  materials: MaterialNeed[];
  /** Products that still need producing but have no active formula. */
  missingFormulas: { productId: string; code: string }[];
}

// Finished goods already in stock cover the order first; only the rest
// needs raw material. Nothing is reserved: this is a live estimate.
export function planMaterials(inputs: PlanInputs): MaterialPlan {
  const needed = new Map<string, Grams>();

  const products = inputs.demand.map(({ productId, pieces }) => {
    const product = inputs.products.get(productId)!;
    const fromStockPieces = Math.min(
      pieces,
      inputs.finishedGoods.get(productId) ?? 0,
    );
    const toProducePieces = pieces - fromStockPieces;
    const formula = inputs.formulas.get(productId);

    if (formula && toProducePieces > 0) {
      const requirement = requiredMaterial({
        pieces: toProducePieces,
        pieceWeightMg: product.pieceWeightMg,
        wasteBasisPoints: formula.wasteBasisPoints,
        lineBasisPoints: formula.lines.map((line) => line.basisPoints),
      });
      formula.lines.forEach(({ rawMaterialId }, index) => {
        const sofar = needed.get(rawMaterialId) ?? 0;
        needed.set(rawMaterialId, grams(sofar + requirement.lines[index]));
      });
    }
    return {
      productId,
      code: product.code,
      orderedPieces: pieces,
      fromStockPieces,
      toProducePieces,
      formulaVersion: formula?.version ?? null,
    };
  });

  const materials = [...needed].map(([rawMaterialId, neededGrams]) => {
    const availableGrams = inputs.materialStock.get(rawMaterialId) ?? grams(0);
    return {
      rawMaterialId,
      neededGrams,
      availableGrams,
      shortageGrams: grams(Math.max(0, neededGrams - availableGrams)),
    };
  });

  const missingFormulas = products
    .filter((p) => p.toProducePieces > 0 && p.formulaVersion === null)
    .map(({ productId, code }) => ({ productId, code }));

  return { products, materials, missingFormulas };
}

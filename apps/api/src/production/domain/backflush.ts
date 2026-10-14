import { grams, type Grams, requiredMaterial } from '@polyledger/shared';

export interface FrozenRecipe {
  pieceWeightMg: number;
  runnerWeightMg: number;
  lines: { rawMaterialId: string; basisPoints: number }[];
}

export interface MaterialUse {
  rawMaterialId: string;
  pieceGrams: Grams;
  runnerGrams: Grams;
}

// What a production entry consumed: (good + rejected) x piece weight, plus
// shots x runner weight, each split by the formula's percents. No waste % on
// top: rejects are counted for real here, and runners are weighed per shot.
export function backflush(
  recipe: FrozenRecipe,
  { pieces, shots }: { pieces: number; shots: number },
): MaterialUse[] {
  const lineBasisPoints = recipe.lines.map((line) => line.basisPoints);
  const split = (count: number, weightMg: number) =>
    count > 0 && weightMg > 0
      ? requiredMaterial({
          pieces: count,
          pieceWeightMg: weightMg,
          wasteBasisPoints: 0,
          lineBasisPoints,
        }).lines
      : recipe.lines.map(() => grams(0));

  const forPieces = split(pieces, recipe.pieceWeightMg);
  const forRunners = split(shots, recipe.runnerWeightMg);
  return recipe.lines.map(({ rawMaterialId }, index) => ({
    rawMaterialId,
    pieceGrams: forPieces[index],
    runnerGrams: forRunners[index],
  }));
}

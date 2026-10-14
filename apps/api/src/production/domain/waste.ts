import { type Grams, requiredMaterial } from '@polyledger/shared';
import type { WasteType } from '../../generated/prisma/client.js';

export interface WasteLine {
  wasteType: WasteType;
  grams: number;
}

// Runners and rejects were already consumed by backflush when the shift was
// recorded. Purge and sweepings are extra material lost at the machine, so
// recording them takes it off the floor.
const OFF_THE_FLOOR: WasteType[] = ['PURGE', 'SWEEPINGS'];

export function floorWasteUse(
  formulaLines: { rawMaterialId: string; basisPoints: number }[],
  waste: WasteLine[],
): { rawMaterialId: string; grams: Grams }[] {
  const lost = waste
    .filter((line) => OFF_THE_FLOOR.includes(line.wasteType))
    .reduce((sum, line) => sum + line.grams, 0);
  if (lost === 0) {
    return [];
  }
  // Each gram counts as a 1 g piece, so the formula split rounds the same
  // way backflush does.
  const { lines } = requiredMaterial({
    pieces: lost,
    pieceWeightMg: 1_000,
    wasteBasisPoints: 0,
    lineBasisPoints: formulaLines.map((line) => line.basisPoints),
  });
  return formulaLines.map(({ rawMaterialId }, index) => ({
    rawMaterialId,
    grams: lines[index],
  }));
}

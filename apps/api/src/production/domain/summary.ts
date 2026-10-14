import { grams, type Grams } from '@polyledger/shared';

export interface SummaryInputs {
  plannedPieces: number;
  goodPieces: number;
  rejectedPieces: number;
  rejectedGrams: Grams;
  issued: Map<string, Grams>;
  returned: Map<string, Grams>;
  purgeAndSweepings: Map<string, Grams>;
  used: Map<string, { pieceGrams: Grams; runnerGrams: Grams }>;
  weighedRejectAndRunnerGrams: Grams;
  materials: Map<string, { code: string; name: string }>;
}

export interface MaterialSummary {
  rawMaterialId: string;
  code: string;
  name: string;
  issuedGrams: Grams;
  usedForPiecesGrams: Grams;
  usedForRunnersGrams: Grams;
  usedForPurgeAndSweepingsGrams: Grams;
  returnedGrams: Grams;
  /** Issued but neither used nor returned: the unexplained loss. */
  differenceGrams: Grams;
}

export interface JobCardSummary {
  plannedPieces: number;
  goodPieces: number;
  rejectedPieces: number;
  /** Rejected out of all pieces made: 2.35% is 235. */
  rejectBasisPoints: number;
  materials: MaterialSummary[];
  /** Runners and rejects as backflushed, against what was weighed as waste. */
  waste: {
    expectedRejectAndRunnerGrams: Grams;
    weighedRejectAndRunnerGrams: Grams;
    /** Expected but never weighed: lost on the way to the scrap yard. */
    differenceGrams: Grams;
  };
}

export function summarize(inputs: SummaryInputs): JobCardSummary {
  const made = inputs.goodPieces + inputs.rejectedPieces;
  const rejectBasisPoints =
    made === 0
      ? 0
      : Math.floor((inputs.rejectedPieces * 20_000 + made) / (made * 2));

  const ids = new Set([
    ...inputs.issued.keys(),
    ...inputs.returned.keys(),
    ...inputs.purgeAndSweepings.keys(),
    ...inputs.used.keys(),
  ]);
  const materials = [...ids]
    .map((rawMaterialId) => {
      const issuedGrams = inputs.issued.get(rawMaterialId) ?? grams(0);
      const returnedGrams = inputs.returned.get(rawMaterialId) ?? grams(0);
      const used = inputs.used.get(rawMaterialId);
      const usedForPiecesGrams = used?.pieceGrams ?? grams(0);
      const usedForRunnersGrams = used?.runnerGrams ?? grams(0);
      const usedForPurgeAndSweepingsGrams =
        inputs.purgeAndSweepings.get(rawMaterialId) ?? grams(0);
      const { code, name } = inputs.materials.get(rawMaterialId)!;
      return {
        rawMaterialId,
        code,
        name,
        issuedGrams,
        usedForPiecesGrams,
        usedForRunnersGrams,
        usedForPurgeAndSweepingsGrams,
        returnedGrams,
        differenceGrams: grams(
          issuedGrams -
            usedForPiecesGrams -
            usedForRunnersGrams -
            usedForPurgeAndSweepingsGrams -
            returnedGrams,
        ),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const expectedRejectAndRunnerGrams = grams(
    inputs.rejectedGrams +
      materials.reduce(
        (sum, material) => sum + material.usedForRunnersGrams,
        0,
      ),
  );
  return {
    plannedPieces: inputs.plannedPieces,
    goodPieces: inputs.goodPieces,
    rejectedPieces: inputs.rejectedPieces,
    rejectBasisPoints,
    materials,
    waste: {
      expectedRejectAndRunnerGrams,
      weighedRejectAndRunnerGrams: inputs.weighedRejectAndRunnerGrams,
      differenceGrams: grams(
        expectedRejectAndRunnerGrams - inputs.weighedRejectAndRunnerGrams,
      ),
    },
  };
}

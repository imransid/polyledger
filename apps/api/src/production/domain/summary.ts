import { grams, type Grams } from '@polyledger/shared';

export interface SummaryInputs {
  plannedPieces: number;
  goodPieces: number;
  rejectedPieces: number;
  issued: Map<string, Grams>;
  returned: Map<string, Grams>;
  used: Map<string, { pieceGrams: Grams; runnerGrams: Grams }>;
  materials: Map<string, { code: string; name: string }>;
}

export interface MaterialSummary {
  rawMaterialId: string;
  code: string;
  name: string;
  issuedGrams: Grams;
  usedForPiecesGrams: Grams;
  usedForRunnersGrams: Grams;
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
    ...inputs.used.keys(),
  ]);
  const materials = [...ids]
    .map((rawMaterialId) => {
      const issuedGrams = inputs.issued.get(rawMaterialId) ?? grams(0);
      const returnedGrams = inputs.returned.get(rawMaterialId) ?? grams(0);
      const used = inputs.used.get(rawMaterialId);
      const usedForPiecesGrams = used?.pieceGrams ?? grams(0);
      const usedForRunnersGrams = used?.runnerGrams ?? grams(0);
      const { code, name } = inputs.materials.get(rawMaterialId)!;
      return {
        rawMaterialId,
        code,
        name,
        issuedGrams,
        usedForPiecesGrams,
        usedForRunnersGrams,
        returnedGrams,
        differenceGrams: grams(
          issuedGrams -
            usedForPiecesGrams -
            usedForRunnersGrams -
            returnedGrams,
        ),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    plannedPieces: inputs.plannedPieces,
    goodPieces: inputs.goodPieces,
    rejectedPieces: inputs.rejectedPieces,
    rejectBasisPoints,
    materials,
  };
}

import { WHOLE_IN_BASIS_POINTS } from '@polyledger/shared';
import { z } from 'zod';

const basisPoints = z.number().int().max(WHOLE_IN_BASIS_POINTS);

export const formulaSchema = z.object({
  wasteBasisPoints: basisPoints.min(0),
  lines: z
    .array(
      z.object({ rawMaterialId: z.uuid(), basisPoints: basisPoints.min(1) }),
    )
    .min(1)
    .refine(
      (lines) =>
        new Set(lines.map((line) => line.rawMaterialId)).size === lines.length,
      'Each raw material can appear only once',
    )
    .refine(
      (lines) =>
        lines.reduce((sum, line) => sum + line.basisPoints, 0) ===
        WHOLE_IN_BASIS_POINTS,
      'Line percents must add up to exactly 100.00%',
    ),
});

export type NewFormulaVersion = z.infer<typeof formulaSchema>;

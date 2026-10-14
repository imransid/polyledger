import { grams } from '@polyledger/shared';
import { describe, expect, it } from 'vitest';
import { backflush } from './backflush.js';
import { entryWarnings } from './entry-warnings.js';
import { summarize } from './summary.js';

const recipe = {
  pieceWeightMg: 2_500,
  runnerWeightMg: 2_000,
  lines: [
    { rawMaterialId: 'pp', basisPoints: 9_800 },
    { rawMaterialId: 'mb', basisPoints: 200 },
  ],
};

describe('backflush', () => {
  it('uses pieces x piece weight plus shots x runner weight, split by the formula', () => {
    // Pieces: 1,040 x 2.5 g = 2,600 g. Runners: 260 x 2 g = 520 g, whose
    // exact split is 509.6 / 10.4, so the leftover gram goes to PP.
    expect(backflush(recipe, { pieces: 1_040, shots: 260 })).toEqual([
      { rawMaterialId: 'pp', pieceGrams: 2_548, runnerGrams: 510 },
      { rawMaterialId: 'mb', pieceGrams: 52, runnerGrams: 10 },
    ]);
  });

  it('uses nothing for runners on a hot runner mould', () => {
    const uses = backflush(
      { ...recipe, runnerWeightMg: 0 },
      { pieces: 1_040, shots: 260 },
    );

    expect(uses.map((use) => use.runnerGrams)).toEqual([0, 0]);
  });
});

describe('entryWarnings', () => {
  const shift = {
    shotStart: 100,
    shotEnd: 350,
    goodPieces: 990,
    rejectedPieces: 10,
  };

  it('stays quiet when the counts agree', () => {
    expect(entryWarnings(shift, 4, 100)).toEqual([]);
  });

  it('warns when pieces and shots disagree or the counter jumps', () => {
    expect(entryWarnings({ ...shift, goodPieces: 1_000 }, 4, 90)).toEqual([
      'Good + rejected is 1010 pieces, but shots x cavities is 1000',
      'Shot counter starts at 100, but the previous entry on this machine ended at 90',
    ]);
  });
});

describe('summarize', () => {
  it('reports rejects and what became of each material', () => {
    const summary = summarize({
      plannedPieces: 10_000,
      goodPieces: 1_000,
      rejectedPieces: 40,
      rejectedGrams: grams(100),
      issued: new Map([['pp', grams(20_000)]]),
      returned: new Map([['pp', grams(2_000)]]),
      purgeAndSweepings: new Map([['pp', grams(1_225)]]),
      used: new Map([
        ['pp', { pieceGrams: grams(2_548), runnerGrams: grams(510) }],
      ]),
      weighedRejectAndRunnerGrams: grams(600),
      materials: new Map([['pp', { code: 'RM-PP-01', name: 'PP' }]]),
    });

    // 40 / 1,040 = 3.846%, rounded to 385 basis points.
    expect(summary.rejectBasisPoints).toBe(385);
    expect(summary.materials).toEqual([
      expect.objectContaining({
        issuedGrams: 20_000,
        usedForPiecesGrams: 2_548,
        usedForRunnersGrams: 510,
        usedForPurgeAndSweepingsGrams: 1_225,
        returnedGrams: 2_000,
        differenceGrams: 13_717,
      }),
    ]);
    // 100 g of rejects and 510 g of runners expected, 600 g weighed.
    expect(summary.waste).toEqual({
      expectedRejectAndRunnerGrams: 610,
      weighedRejectAndRunnerGrams: 600,
      differenceGrams: 10,
    });
  });
});

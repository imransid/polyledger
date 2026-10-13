import { grams } from '@polyledger/shared';
import { describe, expect, it } from 'vitest';
import { planMaterials, type PlanInputs } from './material-plan.js';

const inputs = (overrides: Partial<PlanInputs> = {}): PlanInputs => ({
  demand: [{ productId: 'cap', pieces: 10_000 }],
  products: new Map([['cap', { code: 'CAP-28', pieceWeightMg: 2_500 }]]),
  finishedGoods: new Map(),
  formulas: new Map([
    [
      'cap',
      {
        version: 1,
        wasteBasisPoints: 400,
        lines: [
          { rawMaterialId: 'pp', basisPoints: 9_800 },
          { rawMaterialId: 'mb', basisPoints: 200 },
        ],
      },
    ],
  ]),
  materialStock: new Map([
    ['pp', grams(20_000)],
    ['mb', grams(1_000)],
  ]),
  ...overrides,
});

describe('planMaterials', () => {
  it('needs pieces x weight x (1 + waste) x line percent of each material', () => {
    // 10,000 x 2.5 g x 1.04 = 26,000 g: 25,480 g PP and 520 g masterbatch.
    const plan = planMaterials(inputs());

    expect(plan.materials).toEqual([
      {
        rawMaterialId: 'pp',
        neededGrams: 25_480,
        availableGrams: 20_000,
        shortageGrams: 5_480,
      },
      {
        rawMaterialId: 'mb',
        neededGrams: 520,
        availableGrams: 1_000,
        shortageGrams: 0,
      },
    ]);
  });

  it('covers what it can from finished goods first', () => {
    const plan = planMaterials(
      inputs({ finishedGoods: new Map([['cap', 2_000]]) }),
    );

    expect(plan.products[0]).toMatchObject({
      orderedPieces: 10_000,
      fromStockPieces: 2_000,
      toProducePieces: 8_000,
    });
    expect(plan.materials.map((m) => m.neededGrams)).toEqual([20_384, 416]);
  });

  it('needs no formula when finished goods cover everything', () => {
    const plan = planMaterials(
      inputs({
        finishedGoods: new Map([['cap', 12_000]]),
        formulas: new Map(),
      }),
    );

    expect(plan.products[0].toProducePieces).toBe(0);
    expect(plan.materials).toEqual([]);
    expect(plan.missingFormulas).toEqual([]);
  });

  it('lists products that need producing but have no active formula', () => {
    const plan = planMaterials(inputs({ formulas: new Map() }));

    expect(plan.missingFormulas).toEqual([
      { productId: 'cap', code: 'CAP-28' },
    ]);
    expect(plan.materials).toEqual([]);
  });

  it('adds up a material shared by several products', () => {
    const plan = planMaterials(
      inputs({
        demand: [
          { productId: 'cap', pieces: 1_000 },
          { productId: 'lid', pieces: 1_000 },
        ],
        products: new Map([
          ['cap', { code: 'CAP-28', pieceWeightMg: 2_500 }],
          ['lid', { code: 'LID-90', pieceWeightMg: 10_000 }],
        ]),
        formulas: new Map([
          [
            'cap',
            {
              version: 1,
              wasteBasisPoints: 0,
              lines: [{ rawMaterialId: 'pp', basisPoints: 10_000 }],
            },
          ],
          [
            'lid',
            {
              version: 3,
              wasteBasisPoints: 0,
              lines: [{ rawMaterialId: 'pp', basisPoints: 10_000 }],
            },
          ],
        ]),
      }),
    );

    expect(plan.materials).toEqual([
      expect.objectContaining({ rawMaterialId: 'pp', neededGrams: 12_500 }),
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { grindingLoss, lineGrams, saleLine, saleTotals } from './sums';

describe('grinding loss', () => {
  it('is the input less the output, with its share rounded half up', () => {
    // 320 g of 10.5 kg is 3.0476%.
    expect(grindingLoss(10_500, 10_180)).toEqual({
      lossGrams: 320,
      lossBasisPoints: 305,
    });
    // 1 g of 8 kg is 0.0125%, which rounds up to 0.01%.
    expect(grindingLoss(8_000, 7_999).lossBasisPoints).toBe(1);
    expect(grindingLoss(10_000, 10_000).lossBasisPoints).toBe(0);
    expect(grindingLoss(0, 0).lossBasisPoints).toBeNull();
  });

  it('weighs products by pieces x piece weight', () => {
    // 200 caps of 2.5 g are 500 g.
    expect(lineGrams('PRODUCT', '200', 2_500)).toBe(500);
    expect(lineGrams('RAW_MATERIAL', '9.7', undefined)).toBe(9_700);
    expect(lineGrams('PRODUCT', '2.5', 2_500)).toBeNull();
    expect(lineGrams('PRODUCT', '200', undefined)).toBeNull();
    expect(lineGrams('PRODUCT', '99999999999999999999', 2_500)).toBeNull();
  });
});

describe('scrap sale', () => {
  it('prices each line by weight, rounded half up to whole poisha', () => {
    // 2.345 kg at 45.50 taka is 106.6975 taka.
    expect(saleLine(2_345, '45.50')).toEqual({
      grams: 2_345,
      amountPoisha: 10_670,
    });
    expect(saleLine(2_345, '45.505')).toBeNull();
    expect(saleLine(null, '45.50')).toBeNull();
  });

  it('adds up the lines that read so far', () => {
    expect(
      saleTotals([
        { grams: 2_345, amountPoisha: 10_670 },
        null,
        { grams: 250, amountPoisha: 500 },
      ]),
    ).toEqual({ grams: 2_595, amountPoisha: 11_170 });
    expect(saleTotals([])).toEqual({ grams: 0, amountPoisha: 0 });
  });
});

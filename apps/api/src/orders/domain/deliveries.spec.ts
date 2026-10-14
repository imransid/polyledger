import { describe, expect, it } from 'vitest';
import { deliveryLimit, isFullyDelivered } from './deliveries.js';

describe('deliveryLimit', () => {
  it.each([
    [1_000, 0, 1_000],
    [1_000, 200, 1_020],
    // 333 x 1.015 = 337.995: never round up into pieces nobody allowed.
    [333, 150, 337],
    [7, 10_000, 14],
  ])(
    '%d pieces with %d basis points may ship %d',
    (pieces, tolerance, limit) => {
      expect(deliveryLimit(pieces, tolerance)).toBe(limit);
    },
  );
});

describe('isFullyDelivered', () => {
  it('needs every line delivered, over-delivery counting as delivered', () => {
    const line = (pieces: number, deliveredPieces: number) => ({
      pieces,
      deliveredPieces,
    });

    expect(isFullyDelivered([line(100, 100), line(50, 51)])).toBe(true);
    expect(isFullyDelivered([line(100, 100), line(50, 49)])).toBe(false);
  });
});

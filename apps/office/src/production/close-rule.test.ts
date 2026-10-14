import { describe, expect, it } from 'vitest';
import { canClose } from './close-rule';

const standing = { reversedAt: null };
const reversed = { reversedAt: '2026-10-15T09:00:00.000Z' };
const issued = [{ issuedGrams: 20_000 }, { issuedGrams: 0 }];

describe('canClose', () => {
  it('waits for production once material was issued', () => {
    expect(canClose([], issued)).toBe(false);
    expect(canClose([reversed], issued)).toBe(false);
    expect(canClose([reversed, standing], issued)).toBe(true);
  });

  it('closes a card that never had material at once', () => {
    expect(canClose([], [])).toBe(true);
    expect(canClose([], [{ issuedGrams: 0 }])).toBe(true);
  });
});

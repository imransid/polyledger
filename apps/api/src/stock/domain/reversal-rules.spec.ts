import { describe, expect, it } from 'vitest';
import { isReversible } from './reversal-rules.js';

describe('isReversible', () => {
  it('offers reversal for plain stock documents not yet reversed', () => {
    expect(isReversible({ kind: 'RECEIPT', reversedAt: null })).toBe(true);
    expect(isReversible({ kind: 'SCRAP_TRANSFER', reversedAt: null })).toBe(
      true,
    );
  });

  it('never for reversals, reversed documents or kinds reversed elsewhere', () => {
    expect(isReversible({ kind: 'REVERSAL', reversedAt: null })).toBe(false);
    expect(isReversible({ kind: 'RECEIPT', reversedAt: new Date() })).toBe(
      false,
    );
    for (const kind of ['PRODUCTION', 'WASTE', 'DISPATCH'] as const) {
      expect(isReversible({ kind, reversedAt: null })).toBe(false);
    }
  });
});

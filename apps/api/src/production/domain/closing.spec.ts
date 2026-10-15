import { describe, expect, it } from 'vitest';
import { canClose } from './closing.js';

describe('canClose', () => {
  it('waits for production once material was issued', () => {
    expect(canClose(false, true)).toBe(false);
    expect(canClose(true, true)).toBe(true);
  });

  it('closes a card that never had material at once', () => {
    expect(canClose(false, false)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { refreshDelay } from './session';

const tokenExpiringAt = (exp: number) =>
  `header.${btoa(JSON.stringify({ sub: 'u1', exp })).replace(/=+$/, '')}.signature`;

describe('refreshDelay', () => {
  it('refreshes a minute before the token expires', () => {
    // Issued now, expires in 15 minutes.
    expect(refreshDelay(tokenExpiringAt(1_000 + 15 * 60), 1_000_000)).toBe(
      14 * 60 * 1000,
    );
  });

  it('refreshes at once when that minute has already started', () => {
    expect(refreshDelay(tokenExpiringAt(1_030), 1_000_000)).toBe(0);
  });
});

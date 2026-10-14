import { describe, expect, it } from 'vitest';
import { runSeconds } from './run-time';

describe('runSeconds', () => {
  it('counts whole shots at the cycle time', () => {
    // 10,000 caps in 24 cavities = 417 shots of 8.5 s.
    expect(runSeconds(10_000, 24, 85)).toBe(3_544.5);
    expect(runSeconds(48, 24, 85)).toBe(17);
  });
});

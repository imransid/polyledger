import { describe, expect, it } from 'vitest';
import { phoneSchema } from './phone.js';

describe('phoneSchema', () => {
  it.each([
    ['01712345678', '+8801712345678'],
    ['+8801712345678', '+8801712345678'],
    [' 01712345678 ', '+8801712345678'],
  ])('stores %s as %s', (input, stored) => {
    expect(phoneSchema.parse(input)).toBe(stored);
  });

  it.each([
    '1712345678',
    '8801712345678',
    '+880 1712345678',
    '0171-2345678',
    '017123456789',
    '0271234567',
    '+8802712345678',
  ])('rejects %s', (input) => {
    expect(phoneSchema.safeParse(input).success).toBe(false);
  });
});

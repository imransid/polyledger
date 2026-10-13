import { describe, expect, it } from 'vitest';
import { normalizeLogin } from './login.js';

describe('normalizeLogin', () => {
  it('lowercases emails', () => {
    expect(normalizeLogin(' Rahim@Example.com ')).toBe('rahim@example.com');
  });

  it('turns local phone numbers into +880 form', () => {
    expect(normalizeLogin('01712345678')).toBe('+8801712345678');
  });

  it('returns null for anything else', () => {
    expect(normalizeLogin('rahim')).toBeNull();
  });
});

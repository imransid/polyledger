import { describe, expect, it } from 'vitest';
import {
  BANGLADESH_MOBILE,
  toInternationalPhone,
  toLocalPhone,
} from './phone.js';

describe('Bangladeshi mobile numbers', () => {
  it.each(['01712345678', '+8801712345678'])('accepts %s', (phone) => {
    expect(BANGLADESH_MOBILE.test(phone)).toBe(true);
  });

  it.each(['1712345678', '0171234567', '+88017123456789', '02712345678'])(
    'refuses %s',
    (phone) => {
      expect(BANGLADESH_MOBILE.test(phone)).toBe(false);
    },
  );

  it('converts between the stored and the written form', () => {
    expect(toInternationalPhone('01712345678')).toBe('+8801712345678');
    expect(toInternationalPhone('+8801712345678')).toBe('+8801712345678');
    expect(toLocalPhone('+8801712345678')).toBe('01712345678');
  });
});

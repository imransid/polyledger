import { describe, expect, it } from 'vitest';
import { isTrivialPin, PIN_MAX_LENGTH, PIN_PATTERN } from './pin.js';

describe('tablet PINs', () => {
  it('takes four to six digits', () => {
    expect(PIN_PATTERN.test('2580')).toBe(true);
    expect(PIN_PATTERN.test('258046')).toBe(true);
    expect(PIN_PATTERN.test('258')).toBe(false);
    expect(PIN_PATTERN.test('2580461')).toBe(false);
    expect(PIN_PATTERN.test('25a0')).toBe(false);
  });

  it('stops at PIN_MAX_LENGTH digits', () => {
    expect(PIN_PATTERN.test('2'.repeat(PIN_MAX_LENGTH))).toBe(true);
    expect(PIN_PATTERN.test('2'.repeat(PIN_MAX_LENGTH + 1))).toBe(false);
  });

  it.each([
    '0000',
    '1111',
    '999999',
    '1234',
    '4321',
    '123456',
    '654321',
    '3456',
  ])('refuses the trivial %s', (pin) => {
    expect(isTrivialPin(pin)).toBe(true);
  });

  it.each(['2580', '1235', '7890', '1357', '112233', '9012'])(
    'allows %s',
    (pin) => {
      expect(isTrivialPin(pin)).toBe(false);
    },
  );
});

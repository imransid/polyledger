export type Grams = number & { readonly __unit: 'grams' };

const KILOGRAMS = /^(\d+)(?:\.(\d{1,3}))?$/;

export function isGrams(value: unknown): value is Grams {
  return Number.isSafeInteger(value);
}

export function grams(value: number): Grams {
  if (!isGrams(value)) {
    throw new RangeError(`Not a whole number of grams: ${value}`);
  }
  return value;
}

export function sumGrams(values: readonly Grams[]): Grams {
  return grams(values.reduce((total, value) => total + value, 0));
}

// Parsed as text so "1.005" becomes 1005 g, not 1004.9999999999999.
export function parseKilograms(input: string): Grams {
  const match = KILOGRAMS.exec(input.trim());
  if (!match) {
    throw new RangeError(`Invalid kilograms: "${input}"`);
  }
  const [, whole, fraction = ''] = match;
  return grams(Number(whole) * 1000 + Number(fraction.padEnd(3, '0')));
}

export function formatKilograms(value: Grams): string {
  const sign = value < 0 ? '-' : '';
  const digits = String(Math.abs(value)).padStart(4, '0');
  return `${sign}${digits.slice(0, -3)}.${digits.slice(-3)}`;
}

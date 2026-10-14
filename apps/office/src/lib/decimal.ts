// What people type ("2.5" g, "8.5" s, "97.25" %) to the whole units the API
// stores (2500 mg, 85 tenths, 9725 basis points), without passing through a
// float on the way.
export function parseDecimal(text: string, places: number): number | null {
  const match = new RegExp(`^(\\d+)(?:\\.(\\d{1,${places}}))?$`).exec(
    text.trim(),
  );
  if (!match) {
    return null;
  }
  const [, whole, fraction = ''] = match;
  const value =
    Number(whole) * 10 ** places + Number(fraction.padEnd(places, '0'));
  return Number.isSafeInteger(value) ? value : null;
}

/** 2500 at 3 places is "2.5"; with keepZeros, "2.500". */
export function formatDecimal(
  value: number,
  places: number,
  { keepZeros = false } = {},
): string {
  const digits = String(value).padStart(places + 1, '0');
  const whole = digits.slice(0, -places);
  const fraction = digits.slice(-places);
  const shown = keepZeros ? fraction : fraction.replace(/0+$/, '');
  return shown ? `${whole}.${shown}` : whole;
}

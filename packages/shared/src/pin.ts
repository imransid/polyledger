/** A tablet PIN: four to six digits. */
export const PIN_PATTERN = /^\d{4,6}$/;

// Easy to guess by watching a hand on the screen: one digit repeated, or a
// straight run up or down. Runs don't wrap: 7890 is allowed.
export function isTrivialPin(pin: string): boolean {
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((digit, index) => digit - digits[index]);
  return [0, 1, -1].some((step) => steps.every((each) => each === step));
}

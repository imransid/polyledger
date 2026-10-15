// Closing settles what a card used, so a card that had material waits for
// production to settle. One that never had material can close at once.
export function canClose(
  hasProduction: boolean,
  hadMaterial: boolean,
): boolean {
  return hasProduction || !hadMaterial;
}

// Closing settles what the card used, so it waits until there is
// production to settle. A card that never had material can close at once.
export function canClose(
  entries: { reversedAt: string | null }[],
  materials: { issuedGrams: number }[],
): boolean {
  const produced = entries.some((entry) => !entry.reversedAt);
  const issued = materials.some((material) => material.issuedGrams > 0);
  return produced || !issued;
}

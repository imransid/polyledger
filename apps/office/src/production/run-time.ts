// Each shot fills every cavity, so the last shot may be part-empty.
export function runSeconds(
  pieces: number,
  cavities: number,
  cycleTimeTenths: number,
): number {
  return (Math.ceil(pieces / cavities) * cycleTimeTenths) / 10;
}

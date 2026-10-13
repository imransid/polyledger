import { BadRequestException } from '@nestjs/common';
import type { Location, Prisma } from '../../generated/prisma/client.js';
import { storageProblem } from '../domain/storage.js';
import type { Movement } from './ledger.js';

export async function loadLocations(
  tx: Prisma.TransactionClient,
  ids: string[],
): Promise<Map<string, Location>> {
  const unique = [...new Set(ids)];
  const locations = await tx.location.findMany({
    where: { id: { in: unique }, isActive: true },
  });
  if (locations.length !== unique.length) {
    throw new BadRequestException('Location not found or inactive');
  }
  return new Map(locations.map((location) => [location.id, location]));
}

export function assertStorable(
  movements: Movement[],
  locations: Map<string, Location>,
): void {
  for (const { item, locationId } of movements) {
    const problem = storageProblem(item.type, locations.get(locationId)!.kind);
    if (problem) {
      throw new BadRequestException(problem);
    }
  }
}

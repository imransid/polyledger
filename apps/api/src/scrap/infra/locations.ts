import { BadRequestException } from '@nestjs/common';
import type { QueryBus } from '@nestjs/cqrs';
import type { LocationKind } from '../../generated/prisma/client.js';
import { GetLocationQuery } from '../../stock/queries/get-location.js';

export async function assertLocation(
  queryBus: QueryBus,
  id: string,
  kind: LocationKind,
  message: string,
): Promise<void> {
  const location = await queryBus.execute(new GetLocationQuery(id));
  if (!location?.isActive || location.kind !== kind) {
    throw new BadRequestException(message);
  }
}

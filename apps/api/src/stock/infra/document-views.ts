import type { QueryBus } from '@nestjs/cqrs';
import { GetUserNamesQuery } from '../../auth/queries/get-user-names.js';
import type { StockDocument } from '../../generated/prisma/client.js';
import { isReversible } from '../domain/reversal-rules.js';

export type Described<T> = T & { postedByName: string; reversible: boolean };

// What the documents screen shows beyond the row itself: who posted it and
// whether it can offer a reversal.
export async function describe<T extends StockDocument>(
  queryBus: QueryBus,
  documents: T[],
): Promise<Described<T>[]> {
  const names = await queryBus.execute(
    new GetUserNamesQuery(documents.map((document) => document.postedById)),
  );
  return documents.map((document) => ({
    ...document,
    postedByName: names.get(document.postedById) ?? '',
    reversible: isReversible(document),
  }));
}

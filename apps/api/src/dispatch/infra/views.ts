import { toDateString } from '../../common/dates.js';
import type {
  CustomerReturn,
  CustomerReturnLine,
  Prisma,
} from '../../generated/prisma/client.js';

export const withDetails = {
  lines: { orderBy: { productId: 'asc' } },
  returns: { include: { lines: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.DeliveryChallanInclude;

type ChallanWithDetails = Prisma.DeliveryChallanGetPayload<{
  include: typeof withDetails;
}>;

export type ReturnView = Omit<CustomerReturn, 'returnedOn'> & {
  returnedOn: string;
  lines: CustomerReturnLine[];
};

export type ChallanView = Omit<
  ChallanWithDetails,
  'dispatchedOn' | 'returns'
> & {
  dispatchedOn: string;
  returns: ReturnView[];
};

export function toReturnView(
  customerReturn: CustomerReturn & { lines: CustomerReturnLine[] },
): ReturnView {
  return {
    ...customerReturn,
    returnedOn: toDateString(customerReturn.returnedOn),
  };
}

export function toChallanView(challan: ChallanWithDetails): ChallanView {
  return {
    ...challan,
    dispatchedOn: toDateString(challan.dispatchedOn),
    returns: challan.returns.map(toReturnView),
  };
}

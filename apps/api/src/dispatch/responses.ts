import { z } from 'zod';
import {
  GatePassStatus,
  ReturnReason,
  ReturnSettlement,
} from '../generated/prisma/client.js';

const whole = z.number().int();

export const customerReturnResponse = z.object({
  id: z.uuid(),
  number: z.string(),
  stockDocumentId: z.uuid(),
  challanId: z.uuid(),
  toLocationId: z.uuid(),
  reason: z.enum(ReturnReason),
  settlement: z.enum(ReturnSettlement),
  returnedOn: z.iso.date(),
  reversedAt: z.iso.datetime().nullable(),
  recordedById: z.uuid(),
  createdAt: z.iso.datetime(),
  lines: z.array(
    z.object({ returnId: z.uuid(), productId: z.uuid(), pieces: whole }),
  ),
});

export const challanResponse = z.object({
  id: z.uuid(),
  number: z.string(),
  stockDocumentId: z.uuid(),
  orderId: z.uuid(),
  customerId: z.uuid(),
  fromLocationId: z.uuid(),
  vehicleNumber: z.string(),
  driverName: z.string(),
  driverPhone: z.string(),
  deliveryAddress: z.string(),
  notes: z.string().nullable(),
  dispatchedOn: z.iso.date(),
  gatePassStatus: z.enum(GatePassStatus),
  gatePassedAt: z.iso.datetime().nullable(),
  gatePassedById: z.uuid().nullable(),
  reversedAt: z.iso.datetime().nullable(),
  recordedById: z.uuid(),
  createdAt: z.iso.datetime(),
  lines: z.array(
    z.object({
      challanId: z.uuid(),
      productId: z.uuid(),
      pieces: whole,
      returnedPieces: whole,
    }),
  ),
  returns: z.array(customerReturnResponse),
});

const challanLine = challanResponse.shape.lines.element;

/** The challan with the names its printout and the gate show. */
export const challanDetailsResponse = challanResponse.safeExtend({
  customerCode: z.string(),
  customerName: z.string(),
  orderNumber: z.string(),
  customerPo: z.string().nullable(),
  lines: z.array(
    challanLine.safeExtend({
      code: z.string(),
      name: z.string(),
      piecesPerCarton: whole,
    }),
  ),
});

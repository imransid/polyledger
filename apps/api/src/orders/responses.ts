import { z } from 'zod';
import { SalesOrderStatus } from '../generated/prisma/client.js';

const whole = z.number().int();
const status = z.enum(SalesOrderStatus);

export const salesOrderResponse = z.object({
  id: z.uuid(),
  number: z.string(),
  customerId: z.uuid(),
  orderDate: z.iso.date(),
  deliveryDate: z.iso.date(),
  customerPo: z.string().nullable(),
  notes: z.string().nullable(),
  status,
  cancelReason: z.string().nullable(),
  overDeliveryBasisPoints: whole,
  shortCloseReason: z.string().nullable(),
  createdById: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  lines: z.array(
    z.object({
      orderId: z.uuid(),
      lineNo: whole,
      productId: z.uuid(),
      pieces: whole,
      unitPricePoisha: whole.nullable(),
      deliveredPieces: whole,
      returnedPieces: whole,
    }),
  ),
  /** Still open the day after its delivery date. */
  late: z.boolean(),
});

export const orderDeliveryResponse = z.object({
  orderId: z.uuid(),
  number: z.string(),
  status,
  overDeliveryBasisPoints: whole,
  shortCloseReason: z.string().nullable(),
  lines: z.array(
    z.object({
      lineNo: whole,
      productId: z.uuid(),
      code: z.string(),
      orderedPieces: whole,
      deliveredPieces: whole,
      returnedPieces: whole,
      remainingPieces: whole,
    }),
  ),
});

const productPlan = z.object({
  productId: z.uuid(),
  code: z.string(),
  orderedPieces: whole,
  fromStockPieces: whole,
  toProducePieces: whole,
  formulaVersion: whole.nullable(),
});

const materialNeed = z.object({
  rawMaterialId: z.uuid(),
  code: z.string(),
  name: z.string(),
  neededGrams: whole,
  availableGrams: whole,
  shortageGrams: whole,
});

export const materialCheckResponse = z.object({
  orderId: z.uuid(),
  number: z.string(),
  products: z.array(productPlan),
  materials: z.array(materialNeed),
});

export const materialShortagesResponse = z.object({
  products: z.array(productPlan),
  materials: z.array(materialNeed),
  /** Products still to make that have no active formula. */
  missingFormulas: z.array(z.object({ productId: z.uuid(), code: z.string() })),
});

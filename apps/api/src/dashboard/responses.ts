import { z } from 'zod';

const whole = z.number().int();
const share = whole.nullable();

export const todayFiguresResponse = z.object({
  day: z.iso.date(),
  goodPieces: whole,
  rejectedPieces: whole,
  /** Rejected out of all pieces made: 2.35% is 235. */
  rejectBasisPoints: share,
  machines: z.object({ running: whole, idle: whole, repair: whole }),
});

export const orderFiguresResponse = z.object({
  today: z.iso.date(),
  /** Open orders are due from today to this date. */
  dueBy: z.iso.date(),
  open: z.object({ DRAFT: whole, CONFIRMED: whole, IN_PRODUCTION: whole }),
  lateCount: whole,
  /** The five past their delivery date the longest. */
  mostLate: z.array(
    z.object({
      id: z.uuid(),
      number: z.string(),
      customerCode: z.string(),
      customerName: z.string(),
      deliveryDate: z.iso.date(),
      daysLate: whole,
    }),
  ),
  dueCount: whole,
});

export const stockFiguresResponse = z.object({
  lowStockCount: whole,
  finishedGoodsPieces: whole,
  finishedGoodsStores: z.array(
    z.object({
      locationId: z.uuid(),
      code: z.string(),
      name: z.string(),
      pieces: whole,
    }),
  ),
});

export const leakFiguresResponse = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  closedJobCards: whole,
  /** Over every job card closed in the range; signed. */
  differenceGrams: whole,
  /** The five biggest differences either way. */
  worstJobCards: z.array(
    z.object({
      jobCardId: z.uuid(),
      number: z.string(),
      productCode: z.string(),
      issuedGrams: whole,
      differenceGrams: whole,
      /** Signed share of what was issued: −1.25% is −125. */
      differenceBasisPoints: share,
    }),
  ),
  wasteByDay: z.array(
    z.object({
      day: z.iso.date(),
      wasteGrams: whole,
      materialUsedGrams: whole,
      wasteBasisPoints: share,
    }),
  ),
  shortageGrams: whole,
  grindingLossGrams: whole,
});

export const gateQueueResponse = z.array(
  z.object({
    id: z.uuid(),
    number: z.string(),
    customerCode: z.string(),
    customerName: z.string(),
    vehicleNumber: z.string(),
    waitingMinutes: whole,
    /** Waiting more than an hour. */
    waitedTooLong: z.boolean(),
  }),
);

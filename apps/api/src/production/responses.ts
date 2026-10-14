import { z } from 'zod';
import { JobCardStatus, Shift, WasteType } from '../generated/prisma/client.js';

const whole = z.number().int();

export const jobCardResponse = z.object({
  id: z.uuid(),
  number: z.string(),
  productId: z.uuid(),
  mouldId: z.uuid(),
  machineId: z.uuid(),
  floorLocationId: z.uuid(),
  salesOrderId: z.uuid().nullable(),
  formulaVersionId: z.uuid(),
  pieceWeightMg: whole,
  cavities: whole,
  runnerWeightMg: whole,
  plannedPieces: whole,
  plannedStartDate: z.iso.date(),
  status: z.enum(JobCardStatus),
  cancelReason: z.string().nullable(),
  createdById: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const summaryResponse = z.object({
  plannedPieces: whole,
  goodPieces: whole,
  rejectedPieces: whole,
  piecesOnFloor: whole,
  rejectBasisPoints: whole,
  materials: z.array(
    z.object({
      rawMaterialId: z.uuid(),
      code: z.string(),
      name: z.string(),
      issuedGrams: whole,
      usedForPiecesGrams: whole,
      usedForRunnersGrams: whole,
      usedForPurgeAndSweepingsGrams: whole,
      returnedGrams: whole,
      differenceGrams: whole,
    }),
  ),
  waste: z.object({
    expectedRejectAndRunnerGrams: whole,
    weighedRejectAndRunnerGrams: whole,
    differenceGrams: whole,
  }),
});

export const closedJobCardResponse = jobCardResponse.extend({
  summary: summaryResponse,
});

export const issueSuggestionResponse = z.array(
  z.object({
    rawMaterialId: z.uuid(),
    code: z.string(),
    name: z.string(),
    requiredGrams: whole,
    issuedGrams: whole,
    suggestedGrams: whole,
  }),
);

export const entryResponse = z.object({
  id: z.uuid(),
  jobCardId: z.uuid(),
  shiftDate: z.iso.date(),
  shift: z.enum(Shift),
  operatorId: z.uuid(),
  shotStart: whole,
  shotEnd: whole,
  goodPieces: whole,
  rejectedPieces: whole,
  stockDocumentId: z.uuid(),
  reversedAt: z.iso.datetime().nullable(),
  recordedById: z.uuid(),
  createdAt: z.iso.datetime(),
  materials: z.array(
    z.object({
      entryId: z.uuid(),
      rawMaterialId: z.uuid(),
      pieceGrams: whole,
      runnerGrams: whole,
    }),
  ),
});

/** Warnings never refuse an entry; they ask a supervisor to look. */
export const entryWithWarningsResponse = entryResponse.extend({
  warnings: z.array(z.string()),
});

export const wasteEntryResponse = z.object({
  id: z.uuid(),
  jobCardId: z.uuid(),
  shiftDate: z.iso.date(),
  shift: z.enum(Shift),
  wasteMaterialId: z.uuid(),
  scrapLocationId: z.uuid(),
  stockDocumentId: z.uuid(),
  reversedAt: z.iso.datetime().nullable(),
  recordedById: z.uuid(),
  createdAt: z.iso.datetime(),
  lines: z.array(
    z.object({
      entryId: z.uuid(),
      wasteType: z.enum(WasteType),
      grams: whole,
    }),
  ),
});

export const machineBoardResponse = z.array(
  z.object({
    machineId: z.uuid(),
    code: z.string(),
    name: z.string(),
    state: z.enum(['RUNNING', 'IDLE', 'REPAIR']),
    jobCard: z
      .object({
        id: z.uuid(),
        number: z.string(),
        productId: z.uuid(),
        productCode: z.string(),
      })
      .nullable(),
    goodPiecesToday: whole,
    rejectedPiecesToday: whole,
    rejectBasisPointsToday: whole.nullable(),
  }),
);

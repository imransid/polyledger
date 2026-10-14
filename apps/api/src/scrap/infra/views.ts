import { toDateString } from '../../common/dates.js';
import type {
  GrindingBatch,
  ScrapSale,
  ScrapSaleLine,
} from '../../generated/prisma/client.js';

export type GrindingBatchView = Omit<GrindingBatch, 'groundOn'> & {
  groundOn: string;
  lossGrams: number;
};

export function toGrindingBatchView(batch: GrindingBatch): GrindingBatchView {
  return {
    ...batch,
    groundOn: toDateString(batch.groundOn),
    lossGrams: batch.inputGrams - batch.outputGrams,
  };
}

export type ScrapSaleView = Omit<ScrapSale, 'soldOn'> & {
  soldOn: string;
  lines: ScrapSaleLine[];
  amountPoisha: number;
};

export function toScrapSaleView(
  sale: ScrapSale & { lines: ScrapSaleLine[] },
): ScrapSaleView {
  return {
    ...sale,
    soldOn: toDateString(sale.soldOn),
    amountPoisha: sale.lines.reduce((sum, line) => sum + line.amountPoisha, 0),
  };
}

import { z } from 'zod';
import { timestamps } from '../common/master-data.js';
import { RawMaterialType } from '../generated/prisma/client.js';

export const rawMaterialResponse = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  type: z.enum(RawMaterialType),
  minimumStockGrams: z.number().int(),
  isActive: z.boolean(),
  ...timestamps,
});

import { z } from 'zod';

export const formulaVersionResponse = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  version: z.number().int(),
  wasteBasisPoints: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.iso.datetime(),
  lines: z.array(
    z.object({ rawMaterialId: z.uuid(), basisPoints: z.number().int() }),
  ),
});

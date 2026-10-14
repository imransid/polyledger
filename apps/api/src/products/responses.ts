import { z } from 'zod';
import { timestamps } from '../common/master-data.js';

export const productResponse = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  pieceWeightMg: z.number().int(),
  colour: z.string(),
  piecesPerCarton: z.number().int(),
  isActive: z.boolean(),
  ...timestamps,
});

import { z } from 'zod';
import { timestamps } from '../common/master-data.js';
import { MouldStatus } from '../generated/prisma/client.js';

export const mouldResponse = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  cavities: z.number().int(),
  cycleTimeTenths: z.number().int(),
  runnerWeightMg: z.number().int(),
  productId: z.uuid(),
  status: z.enum(MouldStatus),
  ...timestamps,
});

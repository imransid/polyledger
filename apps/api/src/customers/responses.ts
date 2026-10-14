import { z } from 'zod';
import { timestamps } from '../common/master-data.js';

export const customerResponse = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  phone: z.string(),
  address: z.string(),
  isActive: z.boolean(),
  ...timestamps,
});

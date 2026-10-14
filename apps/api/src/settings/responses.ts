import { z } from 'zod';

/** Empty until the owner saves them. */
export const companyResponse = z.object({
  name: z.string(),
  address: z.string(),
  phone: z.string(),
  bin: z.string().nullable(),
});

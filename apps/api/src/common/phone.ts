import { BANGLADESH_MOBILE, toInternationalPhone } from '@polyledger/shared';
import { z } from 'zod';

export const phoneSchema = z
  .string()
  .trim()
  .regex(BANGLADESH_MOBILE, 'Phone must be 01XXXXXXXXX or +8801XXXXXXXXX')
  .transform(toInternationalPhone);

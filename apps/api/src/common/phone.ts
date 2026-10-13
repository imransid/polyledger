import { z } from 'zod';

const BANGLADESH_MOBILE = /^(?:\+880|0)1\d{9}$/;

export const phoneSchema = z
  .string()
  .trim()
  .regex(BANGLADESH_MOBILE, 'Phone must be 01XXXXXXXXX or +8801XXXXXXXXX')
  .transform((phone) => phone.replace(/^0/, '+880'));

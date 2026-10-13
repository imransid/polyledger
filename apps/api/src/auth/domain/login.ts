import { z } from 'zod';

const BANGLADESH_MOBILE = /^(?:\+880|0)1\d{9}$/;

export const phoneSchema = z
  .string()
  .trim()
  .regex(BANGLADESH_MOBILE, 'Phone must be 01XXXXXXXXX or +8801XXXXXXXXX')
  .transform((phone) => phone.replace(/^0/, '+880'));

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export function normalizeLogin(input: string): string | null {
  return (
    emailSchema.safeParse(input).data ??
    phoneSchema.safeParse(input).data ??
    null
  );
}

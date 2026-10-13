import { z } from 'zod';
import { phoneSchema } from '../../common/phone.js';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export function normalizeLogin(input: string): string | null {
  return (
    emailSchema.safeParse(input).data ??
    phoneSchema.safeParse(input).data ??
    null
  );
}

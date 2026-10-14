import { BANGLADESH_MOBILE } from '@polyledger/shared';
import { z } from 'zod';
import { text } from '@/i18n';
import { parseDecimal } from './decimal';

// Form inputs are text; these turn them into the whole numbers the API
// takes, with a message the user understands when they can't.

export const requiredText = (max: number) =>
  z.string().trim().min(1, text.required).max(max);

export const wholeNumber = () =>
  z.string().trim().regex(/^\d+$/, text.valid.wholeNumber).transform(Number);

export const decimal = (places: number, message: string) =>
  z.string().transform((value, ctx) => {
    const parsed = parseDecimal(value, places);
    if (parsed === null) {
      ctx.issues.push({ code: 'custom', message, input: value });
      return z.NEVER;
    }
    return parsed;
  });

export const phone = () =>
  z.string().trim().regex(BANGLADESH_MOBILE, text.valid.phone);

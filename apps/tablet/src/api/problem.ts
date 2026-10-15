import type { Messages } from '../i18n';
import { ApiError } from './client';

/**
 * What to tell the person at the tablet about a failed call: the screen's
 * own words for the statuses it expects, else the API's message.
 */
export function problemText(
  error: unknown,
  text: Messages,
  byStatus: Record<number, string> = {},
): string {
  if (!(error instanceof ApiError)) {
    return text.errors.unexpected;
  }
  const expected: Record<number, string> = {
    0: text.errors.offline,
    429: text.errors.tooManyAttempts,
    ...byStatus,
  };
  return expected[error.status] ?? error.message;
}

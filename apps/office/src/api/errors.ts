import { text } from '@/i18n';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// The API answers { statusCode, message, error }. The message is a sentence
// ("Not enough stock for RM-PP-01") or, for invalid input, a list of
// "field: problem" lines.
export function errorMessage(status: number, body: unknown): string {
  if (status === 429) {
    return text.errors.tooManyAttempts;
  }
  const message = (body as { message?: unknown } | undefined)?.message;
  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message)) {
    return message.join('\n');
  }
  return text.errors.unexpected;
}

/** The data of a call, or an ApiError with a message fit for the user. */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: Awaited<typeof call>;
  try {
    result = await call;
  } catch {
    throw new ApiError(0, text.errors.offline);
  }
  if (!result.response.ok) {
    throw new ApiError(
      result.response.status,
      errorMessage(result.response.status, result.error),
    );
  }
  return result.data as T;
}

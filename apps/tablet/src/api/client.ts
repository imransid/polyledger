import createClient from 'openapi-fetch';
import type { paths } from './schema';

type Json<Response> = Response extends {
  content: { 'application/json': infer Body };
}
  ? Body
  : never;

export type Pairing = Json<paths['/devices/pair']['post']['responses'][200]>;
export type SignedIn = Json<paths['/sync/sessions']['post']['responses'][201]>;
export type Pulled = Json<paths['/sync/pull']['get']['responses'][200]>;
export type PushChanges =
  paths['/sync/push']['post']['requestBody']['content']['application/json']['changes'];
export type Pushed = Json<paths['/sync/push']['post']['responses'][200]>;

/** Status 0 when the server couldn't be reached. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

export type Api = ReturnType<typeof createApi>;

/** Everything the tablet asks the API, typed from its OpenAPI spec. */
export function createApi(
  baseUrl: string,
  deviceToken: () => string | null,
  fetch?: typeof globalThis.fetch,
) {
  const client = createClient<paths>({ baseUrl, fetch });
  const header = () => ({ 'X-Device-Token': deviceToken() ?? '' });

  return {
    pair: (code: string) =>
      unwrap<Pairing>(client.POST('/devices/pair', { body: { code } })),
    startSession: (userId: string, pin: string) =>
      unwrap<SignedIn>(
        client.POST('/sync/sessions', {
          params: { header: header() },
          body: { userId, pin },
        }),
      ),
    pull: (lastPulledAt: string | null) =>
      unwrap<Pulled>(
        client.GET('/sync/pull', {
          params: {
            header: header(),
            query: lastPulledAt === null ? {} : { lastPulledAt },
          },
        }),
      ),
    push: (changes: PushChanges) =>
      unwrap<Pushed>(
        client.POST('/sync/push', {
          params: { header: header() },
          body: { changes },
        }),
      ),
  };
}

// The API answers errors with { statusCode, message, ... }.
async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: Awaited<typeof call>;
  try {
    result = await call;
  } catch {
    throw new ApiError(0, 'Could not reach the server');
  }
  const { response, error, data } = result;
  if (!response.ok) {
    const message = (error as { message?: unknown } | undefined)?.message;
    throw new ApiError(
      response.status,
      typeof message === 'string' ? message : `HTTP ${response.status}`,
      error,
    );
  }
  return data as T;
}

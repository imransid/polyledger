import { createApi, type Pulled } from '../api/client';

interface Call {
  route: string;
  query: URLSearchParams;
  headers: Headers;
  body: unknown;
}

type Reply = { status?: number; body: unknown } | 'offline';

/**
 * The tablet's API client over a fake server: each route ("GET /sync/pull")
 * answers from its function, and every call is kept for checking.
 */
export function fakeApi(routes: Record<string, (call: Call) => Reply>) {
  const calls: Call[] = [];
  const fetch = async (request: Request) => {
    const url = new URL(request.url);
    const call: Call = {
      route: `${request.method} ${url.pathname}`,
      query: url.searchParams,
      headers: request.headers,
      body: request.method === 'GET' ? undefined : await request.json(),
    };
    calls.push(call);
    const answer = routes[call.route];
    if (!answer) {
      throw new Error(`No fake for ${call.route}`);
    }
    const reply = answer(call);
    if (reply === 'offline') {
      throw new TypeError('Network request failed');
    }
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const api = createApi(
    'http://api.test',
    () => 'tablet-token',
    fetch as typeof globalThis.fetch,
  );
  return { api, calls };
}

/** A pull with nothing in it but what `changes` adds. */
export function pulled(
  timestamp: number,
  changes: Partial<{
    [Table in keyof Pulled['changes']]: Partial<Pulled['changes'][Table]>;
  }> = {},
): Pulled {
  const tables = [
    'job_cards',
    'products',
    'moulds',
    'machines',
    'operators',
    'tablet_users',
    'raw_materials',
    'locations',
    'rejections',
  ] as const;
  return {
    timestamp,
    changes: Object.fromEntries(
      tables.map((table) => [
        table,
        { created: [], updated: [], deleted: [], ...changes[table] },
      ]),
    ) as Pulled['changes'],
  };
}

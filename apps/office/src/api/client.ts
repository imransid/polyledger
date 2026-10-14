import createClient, { type Middleware } from 'openapi-fetch';
import { currentAccessToken, refreshSession } from '@/auth/session';
import { API_BASE_URL } from './base-url';
import type { paths } from './schema';

const retries = new Map<string, Request>();

// Adds the access token. If it has expired anyway (a laptop waking from
// sleep), refreshes once and retries; if that fails the session is over and
// the app shows the login page.
const bearerToken: Middleware = {
  onRequest({ request, id }) {
    const token = currentAccessToken();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
    retries.set(id, request.clone());
    return request;
  },
  async onResponse({ response, id }) {
    const retry = retries.get(id);
    retries.delete(id);
    if (response.status !== 401 || !retry) {
      return response;
    }
    const token = await refreshSession();
    if (!token) {
      return response;
    }
    retry.headers.set('Authorization', `Bearer ${token}`);
    return fetch(retry);
  },
  onError({ id }) {
    retries.delete(id);
  },
};

/** Typed from the API's OpenAPI spec; run `pnpm api:client` after API changes. */
export const api = createClient<paths>({ baseUrl: API_BASE_URL });
api.use(bearerToken);

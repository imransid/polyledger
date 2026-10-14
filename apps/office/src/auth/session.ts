import createClient from 'openapi-fetch';
import { unwrap } from '@/api/errors';
import type { paths } from '@/api/schema';

export type Session =
  | { status: 'starting' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; accessToken: string };

// The access token lives only in this module's memory. The refresh token is
// an httpOnly cookie the page never sees: X-Client: office asks the API to
// set it, and a reload signs in again through it.
const sessionApi = createClient<paths>({
  baseUrl: '/api',
  headers: { 'X-Client': 'office' },
});

const REFRESH_EARLY_MS = 60_000;
const OFFLINE_RETRY_MS = 15_000;

let session: Session = { status: 'starting' };
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshing: Promise<string | null> | undefined;
const listeners = new Set<() => void>();

export function getSession(): Session {
  return session;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentAccessToken(): string | null {
  return session.status === 'signed-in' ? session.accessToken : null;
}

export async function logIn(login: string, password: string): Promise<void> {
  const { accessToken } = await unwrap(
    sessionApi.POST('/auth/login', { body: { login, password } }),
  );
  signIn(accessToken);
}

/** A fresh access token, or null once the session is over. */
export function refreshSession(): Promise<string | null> {
  // Callers in this tab share one refresh; other tabs refreshing at the
  // same moment are covered by the API's 30 second grace.
  refreshing ??= requestRefresh().finally(() => {
    refreshing = undefined;
  });
  return refreshing;
}

export async function logOut(): Promise<void> {
  // Ending it on the server is best effort; here it ends regardless.
  await sessionApi.POST('/auth/logout', { body: {} }).catch(() => undefined);
  signOut();
}

// Refresh a minute before the access token expires, so requests never
// carry an expired one.
export function refreshDelay(accessToken: string, now: number): number {
  const payload = accessToken.split('.')[1] ?? '';
  const { exp } = JSON.parse(
    atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
  ) as { exp: number };
  return Math.max(0, exp * 1000 - now - REFRESH_EARLY_MS);
}

async function requestRefresh(): Promise<string | null> {
  try {
    const { data } = await sessionApi.POST('/auth/refresh', { body: {} });
    if (data) {
      signIn(data.accessToken);
      return data.accessToken;
    }
  } catch {
    // Offline for a moment: keep the session and try again soon.
    if (session.status === 'signed-in') {
      scheduleRefresh(OFFLINE_RETRY_MS);
      return session.accessToken;
    }
  }
  signOut();
  return null;
}

function signIn(accessToken: string) {
  setSession({ status: 'signed-in', accessToken });
  scheduleRefresh(refreshDelay(accessToken, Date.now()));
}

function signOut() {
  clearTimeout(refreshTimer);
  setSession({ status: 'signed-out' });
}

function scheduleRefresh(delay: number) {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void refreshSession(), delay);
}

function setSession(next: Session) {
  session = next;
  for (const listener of listeners) {
    listener();
  }
}

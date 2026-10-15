import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { SignedIn } from '../api/client';
import type { Statements } from '../db/database';
import { readSetting, writeSetting } from '../db/settings';

export interface Session {
  /** Goes on every record made while signed in. */
  id: string;
  user: SignedIn['user'];
  /** On this tablet's clock, which may not agree with the server's. */
  endsAt: number;
}

const CHECK_EVERY_MS = 30_000;

export function sessionFrom(signedIn: SignedIn, now: number): Session {
  const lasts = Date.parse(signedIn.expiresAt) - Date.parse(signedIn.startedAt);
  return { id: signedIn.sessionId, user: signedIn.user, endsAt: now + lasts };
}

export function hasEnded(session: Session, now: number): boolean {
  return now >= session.endsAt;
}

export async function readSession(db: Statements): Promise<Session | null> {
  const saved = await readSetting(db, 'session');
  return saved === null ? null : (JSON.parse(saved) as Session);
}

export function saveSession(tx: Statements, session: Session | null) {
  return writeSetting(tx, 'session', session && JSON.stringify(session));
}

// Tablets are shared, so a forgotten sign-in ends by itself. Checked often
// and again whenever the tablet wakes, as timers sleep with it.
export function useSignOutWhenEnded(
  session: Session | null,
  signOut: () => void,
) {
  useEffect(() => {
    if (!session) {
      return;
    }
    const check = () => {
      if (hasEnded(session, Date.now())) {
        signOut();
      }
    };
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    const wake = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        check();
      }
    });
    return () => {
      clearInterval(timer);
      wake.remove();
    };
  }, [session, signOut]);
}

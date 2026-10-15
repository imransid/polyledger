import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { hasEnded, sessionFrom, useSignOutWhenEnded } from './session';

const HOUR = 3_600_000;

const signedIn = {
  sessionId: 'session-1',
  user: { id: 'operator-1', name: 'Rahim Uddin', role: 'OPERATOR' as const },
  startedAt: '2026-10-15T02:00:00.000Z',
  expiresAt: '2026-10-15T14:00:00.000Z',
};

describe('tablet sign-in', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('lasts the server’s 12 hours on the tablet’s own clock', () => {
    // The tablet's clock is 7 hours off the server's.
    const signedInAt = Date.UTC(2026, 9, 15, 9, 0);
    const session = sessionFrom(signedIn, signedInAt);

    expect(hasEnded(session, signedInAt + 12 * HOUR - 1)).toBe(false);
    expect(hasEnded(session, signedInAt + 12 * HOUR)).toBe(true);
  });

  it('signs out by itself once the 12 hours are up', async () => {
    jest.useFakeTimers({ now: Date.UTC(2026, 9, 15, 2, 0) });
    const session = sessionFrom(signedIn, Date.now());
    const signOut = jest.fn();

    await renderHook(() => useSignOutWhenEnded(session, signOut));
    await act(() => jest.advanceTimersByTime(12 * HOUR - 60_000));
    expect(signOut).not.toHaveBeenCalled();

    await act(() => jest.advanceTimersByTime(60_000));
    expect(signOut).toHaveBeenCalled();
  });
});

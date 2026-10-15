import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import type { Database } from '../db/database';
import { testDatabase } from '../test/database';
import { fakeApi } from '../test/fake-api';
import { renderWithApp } from '../test/render';
import type { Session } from './session';
import { SignInScreen } from './sign-in-screen';

const HOUR = 3_600_000;

describe('sign-in screen', () => {
  let db: Database;
  let onSignedIn: jest.Mock<(session: Session) => Promise<void>>;

  beforeEach(async () => {
    db = await testDatabase();
    await db.write(async (tx) => {
      for (const [id, name, role] of [
        ['supervisor-1', 'Abdul Karim', 'SUPERVISOR'],
        ['operator-1', 'Rahim Uddin', 'OPERATOR'],
        ['operator-2', 'Fatema Begum', 'OPERATOR'],
      ]) {
        await tx.run(
          'INSERT INTO tablet_users (id, name, role) VALUES (?, ?, ?)',
          id,
          name,
          role,
        );
      }
    });
    onSignedIn = jest.fn(async () => undefined);
  });

  async function typePin() {
    for (const digit of '2580') {
      await fireEvent.press(screen.getByRole('button', { name: digit }));
    }
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  }

  async function enterPin(api: ReturnType<typeof fakeApi>['api']) {
    await renderWithApp(<SignInScreen onSignedIn={onSignedIn} />, { db, api });
    await fireEvent.press(
      await screen.findByRole('button', { name: 'Rahim Uddin' }),
    );
    await typePin();
  }

  it('lists operators first', async () => {
    await renderWithApp(<SignInScreen onSignedIn={onSignedIn} />, {
      db,
      api: fakeApi({}).api,
    });

    expect(
      (await screen.findAllByText(/Uddin|Begum|Karim/)).map(
        (name) => name.props.children,
      ),
    ).toEqual(['Fatema Begum', 'Rahim Uddin', 'Abdul Karim']);
  });

  it('signs in with the PIN of the name picked', async () => {
    const { api, calls } = fakeApi({
      'POST /sync/sessions': () => ({
        status: 201,
        body: {
          sessionId: 'session-1',
          user: { id: 'operator-1', name: 'Rahim Uddin', role: 'OPERATOR' },
          startedAt: '2026-10-15T02:00:00.000Z',
          expiresAt: '2026-10-15T14:00:00.000Z',
        },
      }),
    });

    await enterPin(api);

    expect(calls.at(-1)?.body).toEqual({ userId: 'operator-1', pin: '2580' });
    expect(onSignedIn).toHaveBeenCalledWith({
      id: 'session-1',
      user: { id: 'operator-1', name: 'Rahim Uddin', role: 'OPERATOR' },
      endsAt: expect.any(Number),
    });
    const [session] = onSignedIn.mock.calls[0];
    expect(session.endsAt - Date.now()).toBeGreaterThan(12 * HOUR - 60_000);
  });

  it('shows a lock-out plainly, with how long it lasts', async () => {
    const { api } = fakeApi({
      'POST /sync/sessions': () => ({
        status: 423,
        body: {
          statusCode: 423,
          message: 'Too many wrong PINs on this tablet; try again in 15 min',
          retryAfterMinutes: 15,
        },
      }),
    });

    await enterPin(api);

    expect(await screen.findByText('Locked for now')).toBeTruthy();
    screen.getByText(
      'Too many wrong PINs. Try again on this tablet in 15 min.',
    );
    expect(screen.getByLabelText('0 digits entered')).toBeTruthy();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('says when the PIN is wrong or the server cannot be reached', async () => {
    const answers = [
      { status: 401, body: { statusCode: 401, message: 'Wrong PIN' } },
      'offline' as const,
    ];
    const { api } = fakeApi({ 'POST /sync/sessions': () => answers.shift()! });

    await enterPin(api);
    expect(await screen.findByText('Wrong PIN. Try again.')).toBeTruthy();

    await typePin();
    expect(
      await screen.findByText('Signing in needs the server. Check the Wi-Fi.'),
    ).toBeTruthy();
  });
});

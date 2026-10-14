import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { text } from '@/i18n';
import { page, user as aUser } from '@/test/fixtures';
import { renderArea } from '@/test/render';
import { server } from '@/test/server';
import { UsersArea } from './area';

const words = text.users;
const mount = '/users/*';

describe('users', () => {
  it('creates a user with a phone login', async () => {
    const bodies: unknown[] = [];
    server.use(
      http.get('*/api/users', () => HttpResponse.json(page([]))),
      http.post('*/api/users', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(aUser(), { status: 201 });
      }),
    );
    const { user } = renderArea(<UsersArea />, {
      mount,
      at: '/users',
      role: 'OWNER',
    });

    await user.click(
      await screen.findByRole('link', { name: text.list.create }),
    );
    await user.type(await screen.findByLabelText(words.name), 'Shahin Alam');
    await user.type(screen.getByLabelText(words.phone), '01811000202');
    await user.type(screen.getByLabelText(words.password), 'shift a operator');
    await user.click(screen.getByRole('button', { name: text.record.save }));

    expect(
      await screen.findByRole('heading', { name: words.title }),
    ).toBeTruthy();
    expect(bodies).toEqual([
      {
        name: 'Shahin Alam',
        phone: '01811000202',
        role: 'OPERATOR',
        password: 'shift a operator',
      },
    ]);
  });

  it('resets a password after asking, and logs the user out everywhere', async () => {
    const operator = aUser();
    const bodies: unknown[] = [];
    server.use(
      http.get('*/api/users', () => HttpResponse.json(page([operator]))),
      http.post(
        `*/api/users/${operator.id}/reset-password`,
        async ({ request }) => {
          bodies.push(await request.json());
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    const { user } = renderArea(<UsersArea />, {
      mount,
      at: '/users',
      role: 'OWNER',
    });

    await user.click(
      await screen.findByRole('button', { name: words.resetPassword }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(words.confirmReset('Shahin Alam')),
    ).toBeTruthy();
    await user.type(within(dialog).getByLabelText(words.newPassword), 'short');
    await user.click(
      within(dialog).getByRole('button', { name: text.confirm.yes }),
    );
    expect(
      await within(dialog).findByText(text.password.tooShort),
    ).toBeTruthy();
    expect(bodies).toEqual([]);

    await user.clear(within(dialog).getByLabelText(words.newPassword));
    await user.type(
      within(dialog).getByLabelText(words.newPassword),
      'a new password',
    );
    await user.click(
      within(dialog).getByRole('button', { name: text.confirm.yes }),
    );

    expect(await screen.findByText(words.passwordReset)).toBeTruthy();
    expect(bodies).toEqual([{ newPassword: 'a new password' }]);
  });
});

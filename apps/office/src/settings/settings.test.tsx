import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Company } from '@/api/types';
import { text } from '@/i18n';
import { company } from '@/test/fixtures';
import { renderArea } from '@/test/render';
import { server } from '@/test/server';
import { SettingsArea } from './area';

const words = text.settings;

describe('company settings', () => {
  it('saves the details printed on challans, with the BIN only when it is 13 digits', async () => {
    let saved = company({ name: '', address: '', phone: '' });
    const calls: { body: Company; key: string | null }[] = [];
    server.use(
      http.get('*/api/settings/company', () => HttpResponse.json(saved)),
      http.put('*/api/settings/company', async ({ request }) => {
        saved = (await request.json()) as Company;
        calls.push({
          body: saved,
          key: request.headers.get('Idempotency-Key'),
        });
        return HttpResponse.json(saved);
      }),
    );
    const { user } = renderArea(<SettingsArea />, {
      mount: '/settings/*',
      at: '/settings',
      role: 'OWNER',
    });

    await user.type(await screen.findByLabelText(words.name), company().name);
    await user.type(screen.getByLabelText(words.address), company().address);
    await user.type(screen.getByLabelText(words.phone), company().phone);
    await user.type(screen.getByLabelText(words.bin), '001234567890');
    await user.click(screen.getByRole('button', { name: text.record.save }));

    expect(await screen.findByText(words.binInvalid)).toBeTruthy();
    expect(calls).toHaveLength(0);

    await user.type(screen.getByLabelText(words.bin), '1');
    await user.click(screen.getByRole('button', { name: text.record.save }));
    expect(await screen.findByText(text.record.saved)).toBeTruthy();

    await user.clear(screen.getByLabelText(words.bin));
    await user.click(screen.getByRole('button', { name: text.record.save }));
    expect(await screen.findByText(text.record.saved)).toBeTruthy();

    expect(calls.map((call) => call.body)).toEqual([
      { ...company(), bin: '0012345678901' },
      { ...company(), bin: null },
    ]);
    // The form stays open, so its second save is a new write.
    expect(calls[1].key).not.toBe(calls[0].key);
  });
});

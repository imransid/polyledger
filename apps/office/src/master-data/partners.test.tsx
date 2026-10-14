import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { text } from '@/i18n';
import { page, partner } from '@/test/fixtures';
import { renderArea } from '@/test/render';
import { server } from '@/test/server';
import { MasterDataArea } from './area';

const mount = '/master-data/*';
const words = text.masterData;

describe('customers', () => {
  it('checks the phone, then creates the customer', async () => {
    const created = partner();
    const bodies: unknown[] = [];
    server.use(
      http.post('*/api/customers', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(created, { status: 201 });
      }),
      http.get(`*/api/customers/${created.id}`, () =>
        HttpResponse.json(created),
      ),
    );
    const { user } = renderArea(<MasterDataArea />, {
      mount,
      at: '/master-data/customers/new',
    });

    await user.type(screen.getByLabelText(words.code), 'CUS-PADMA');
    await user.type(screen.getByLabelText(words.name), 'Padma Drinks Ltd');
    await user.type(screen.getByLabelText(words.phone), '1711000101');
    await user.type(screen.getByLabelText(words.address), 'Tongi, Gazipur');
    await user.click(screen.getByRole('button', { name: text.record.save }));
    expect(await screen.findByText(text.valid.phone)).toBeTruthy();
    expect(bodies).toEqual([]);

    await user.clear(screen.getByLabelText(words.phone));
    await user.type(screen.getByLabelText(words.phone), '01711000101');
    await user.click(screen.getByRole('button', { name: text.record.save }));

    expect(
      await screen.findByRole('heading', {
        name: 'CUS-PADMA · Padma Drinks Ltd',
      }),
    ).toBeTruthy();
    expect(bodies).toEqual([
      {
        code: 'CUS-PADMA',
        name: 'Padma Drinks Ltd',
        phone: '01711000101',
        address: 'Tongi, Gazipur',
      },
    ]);
    // Stored as +880, shown the way people write it.
    expect(screen.getByLabelText<HTMLInputElement>(words.phone).value).toBe(
      '01711000101',
    );
  });
});

describe('suppliers', () => {
  it('deactivates a supplier with its own Idempotency-Key', async () => {
    let supplier = partner({
      code: 'SUP-BENGAL',
      name: 'Bengal Polymer Traders',
    });
    const keys: (string | null)[] = [];
    server.use(
      http.get('*/api/suppliers', () => HttpResponse.json(page([supplier]))),
      http.get(`*/api/suppliers/${supplier.id}`, () =>
        HttpResponse.json(supplier),
      ),
      http.post(`*/api/suppliers/${supplier.id}/deactivate`, ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'));
        supplier = { ...supplier, isActive: false };
        return HttpResponse.json(supplier);
      }),
    );
    const { user } = renderArea(<MasterDataArea />, {
      mount,
      at: '/master-data/suppliers',
    });

    expect(await screen.findByText('01711000101')).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'SUP-BENGAL' }));
    await user.click(
      await screen.findByRole('button', { name: text.record.deactivate }),
    );

    expect(
      await screen.findByRole('button', { name: text.record.reactivate }),
    ).toBeTruthy();
    expect(screen.getByText(text.record.inactive)).toBeTruthy();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

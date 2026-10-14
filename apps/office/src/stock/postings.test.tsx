import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { text } from '@/i18n';
import {
  balance,
  page,
  product,
  rawMaterial,
  stockDocument,
} from '@/test/fixtures';
import { renderArea } from '@/test/render';
import { server } from '@/test/server';
import { floor, stockLookups, store, supplier } from '@/test/stock-lookups';
import { StockArea } from './area';

const mount = '/stock/*';
const words = text.stock;
const pp = rawMaterial();
const cap = product();

/** Answers a posting with `answer`, keeping each body and key it got. */
function posting(path: string, answer: object) {
  const calls: { body: unknown; key: string | null }[] = [];
  server.use(
    http.post(path, async ({ request }) => {
      calls.push({
        body: await request.json(),
        key: request.headers.get('Idempotency-Key'),
      });
      return HttpResponse.json(answer, { status: 201 });
    }),
  );
  return calls;
}

describe('receiving goods', () => {
  it('shows the shortage of each line while it is typed', async () => {
    server.use(...stockLookups());
    const { user } = renderArea(<StockArea />, { mount, at: '/stock/receive' });
    const challan = await screen.findByLabelText(words.receive.challanKg);
    const received = screen.getByLabelText(words.receive.receivedKg);
    const shortage = screen.getByTestId('shortage');

    await user.type(challan, '1000');
    await user.type(received, '998.5');
    expect(shortage.textContent).toBe('Short 1.500 kg');

    await user.clear(received);
    await user.type(received, '1000.25');
    expect(shortage.textContent).toBe('Over 0.250 kg');

    await user.clear(received);
    await user.type(received, '1000');
    expect(shortage.textContent).toBe(words.receive.exact);
  });

  it('posts a GRN, shows its number and is ready for the next truck', async () => {
    server.use(...stockLookups());
    const grn = stockDocument({ number: 'GRN-000042' });
    const calls = posting('*/api/stock/receipts', grn);
    const { user } = renderArea(<StockArea />, {
      mount,
      at: '/stock/receive',
      role: 'STOREKEEPER',
    });

    await user.selectOptions(
      await screen.findByLabelText(words.receive.supplier),
      supplier.id,
    );
    await user.type(screen.getByLabelText(words.receive.challan), 'BPT-5521');
    await user.selectOptions(
      screen.getByLabelText(words.receive.material),
      pp.id,
    );
    await user.type(screen.getByLabelText(words.receive.challanKg), '2000');
    await user.type(screen.getByLabelText(words.receive.receivedKg), '1998.5');
    await user.click(
      screen.getByRole('button', { name: words.receive.submit }),
    );

    const link = await screen.findByRole('link', { name: 'GRN-000042' });
    expect(link.getAttribute('href')).toBe(`/stock/documents/${grn.id}`);
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toMatchObject({
      supplierId: supplier.id,
      supplierReference: 'BPT-5521',
      // The only store is chosen already.
      locationId: store.id,
      lines: [
        {
          rawMaterialId: pp.id,
          challanKilograms: '2000',
          receivedKilograms: '1998.5',
        },
      ],
    });
    expect(calls[0].key).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      screen.getByLabelText<HTMLSelectElement>(words.receive.supplier).value,
    ).toBe(supplier.id);
    expect(
      screen.getByLabelText<HTMLInputElement>(words.receive.challan).value,
    ).toBe('');
    expect(
      screen.getByLabelText<HTMLInputElement>(words.receive.challanKg).value,
    ).toBe('');
  });
});

describe('transfers', () => {
  it('shows what the from-location holds and blocks a line asking for more', async () => {
    server.use(
      ...stockLookups(),
      http.get('*/api/stock/balances', () =>
        HttpResponse.json(page([balance()])),
      ),
    );
    const calls = posting(
      '*/api/stock/transfers',
      stockDocument({ number: 'TRF-000007', kind: 'TRANSFER' }),
    );
    const { user } = renderArea(<StockArea />, {
      mount,
      at: '/stock/transfer',
    });

    await user.selectOptions(
      await screen.findByLabelText(words.transfer.from),
      store.id,
    );
    await user.selectOptions(
      screen.getByLabelText(words.transfer.to),
      floor.id,
    );
    await user.selectOptions(
      screen.getByLabelText(words.item),
      `RAW_MATERIAL:${pp.id}`,
    );
    const quantity = screen.getByLabelText(`${words.quantity} (kg)`);
    await user.type(quantity, '1300');
    const post = screen.getByRole('button', { name: words.transfer.submit });

    expect(await screen.findByText('Only 1,250.500 kg available')).toBeTruthy();
    expect(post).toHaveProperty('disabled', true);

    await user.clear(quantity);
    await user.type(quantity, '1000');
    expect(await screen.findByText('Available 1,250.500 kg')).toBeTruthy();
    expect(post).toHaveProperty('disabled', false);
    await user.click(post);

    expect(
      await screen.findByRole('link', { name: 'TRF-000007' }),
    ).toBeTruthy();
    expect(calls[0].body).toEqual({
      fromLocationId: store.id,
      toLocationId: floor.id,
      lines: [{ itemType: 'RAW_MATERIAL', itemId: pp.id, kilograms: '1000' }],
    });
  });
});

describe('adjustments', () => {
  it('shows the difference between the count and the stock before posting', async () => {
    server.use(
      ...stockLookups(),
      http.get('*/api/stock/balances', () =>
        HttpResponse.json(page([balance({ grams: 1_000_000 })])),
      ),
    );
    const calls = posting(
      '*/api/stock/adjustments',
      stockDocument({ number: 'ADJ-000003', kind: 'ADJUSTMENT' }),
    );
    const { user } = renderArea(<StockArea />, { mount, at: '/stock/adjust' });

    await user.selectOptions(
      await screen.findByLabelText(words.location),
      store.id,
    );
    await user.selectOptions(
      screen.getByLabelText(words.item),
      `RAW_MATERIAL:${pp.id}`,
    );
    await user.type(
      screen.getByLabelText(`${words.adjust.counted} (kg)`),
      '950',
    );

    expect(await screen.findByText('Now 1,000.000 kg')).toBeTruthy();
    expect(screen.getByText('Difference −50.000 kg')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: words.adjust.submit }));
    expect(await screen.findByText(text.required)).toBeTruthy();
    expect(calls).toHaveLength(0);

    await user.type(
      screen.getByLabelText(words.adjust.reason),
      'Monthly count',
    );
    await user.click(screen.getByRole('button', { name: words.adjust.submit }));

    expect(
      await screen.findByRole('link', { name: 'ADJ-000003' }),
    ).toBeTruthy();
    expect(calls[0].body).toEqual({
      locationId: store.id,
      reason: 'Monthly count',
      lines: [{ itemType: 'RAW_MATERIAL', itemId: pp.id, kilograms: '950' }],
    });
  });
});

describe('opening stock', () => {
  it('counts products in pieces', async () => {
    server.use(...stockLookups());
    const calls = posting(
      '*/api/stock/openings',
      stockDocument({ number: 'OPN-000001', kind: 'OPENING' }),
    );
    const { user } = renderArea(<StockArea />, { mount, at: '/stock/opening' });

    await user.selectOptions(
      await screen.findByLabelText(words.location),
      store.id,
    );
    const item = screen.getByLabelText(words.item);
    expect(
      within(item).getByRole('group', { name: words.products }),
    ).toBeTruthy();
    await user.selectOptions(item, `PRODUCT:${cap.id}`);
    await user.type(
      screen.getByLabelText(`${words.opening.counted} (pcs)`),
      '2.5',
    );
    await user.click(
      screen.getByRole('button', { name: words.opening.submit }),
    );
    expect(await screen.findByText(text.valid.wholeNumber)).toBeTruthy();

    await user.clear(screen.getByLabelText(`${words.opening.counted} (pcs)`));
    await user.type(
      screen.getByLabelText(`${words.opening.counted} (pcs)`),
      '60000',
    );
    await user.click(
      screen.getByRole('button', { name: words.opening.submit }),
    );

    expect(
      await screen.findByRole('link', { name: 'OPN-000001' }),
    ).toBeTruthy();
    expect(calls[0].body).toEqual({
      locationId: store.id,
      lines: [{ itemType: 'PRODUCT', itemId: cap.id, pieces: 60_000 }],
    });
  });
});

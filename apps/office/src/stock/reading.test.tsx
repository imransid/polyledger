import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Role } from '@/api/types';
import { text } from '@/i18n';
import {
  balance,
  cardLine,
  page,
  rawMaterial,
  stockDocument,
} from '@/test/fixtures';
import { renderArea } from '@/test/render';
import { server } from '@/test/server';
import { stockLookups, store, supplier } from '@/test/stock-lookups';
import { StockArea } from './area';

const mount = '/stock/*';
const words = text.stock;
const pp = rawMaterial();

describe('documents', () => {
  it('lists documents by type and date range and opens one', async () => {
    const grn = stockDocument({
      supplierId: supplier.id,
      supplierReference: 'BPT-5521',
      receivedOn: '2026-10-14T00:00:00.000Z',
      receiptLines: [
        {
          documentId: '',
          rawMaterialId: pp.id,
          challanGrams: 2_000_000,
          receivedGrams: 1_998_500,
        },
      ],
      entries: [
        {
          id: 1,
          documentId: '',
          itemType: 'RAW_MATERIAL',
          itemId: pp.id,
          locationId: store.id,
          movementType: 'RECEIPT',
          grams: 1_998_500,
          pieces: null,
          reversalOfId: null,
          postedById: '',
          postedAt: '2026-10-14T05:30:00.000Z',
        },
      ],
    });
    const asked: URLSearchParams[] = [];
    server.use(
      ...stockLookups(),
      http.get('*/api/stock/documents', ({ request }) => {
        asked.push(new URL(request.url).searchParams);
        return HttpResponse.json(page([grn]));
      }),
      http.get(`*/api/stock/documents/${grn.id}`, () => HttpResponse.json(grn)),
    );
    const { user } = renderArea(<StockArea />, {
      mount,
      at: '/stock/documents',
    });

    await user.selectOptions(
      await screen.findByLabelText(words.documents.kind),
      'RECEIPT',
    );
    await user.type(screen.getByLabelText(words.documents.from), '2026-10-01');
    await waitFor(() => {
      expect(asked.at(-1)?.get('kind')).toBe('RECEIPT');
      expect(asked.at(-1)?.get('from')).toBe('2026-10-01');
    });
    expect(screen.getByText('Rafiqul Islam')).toBeTruthy();

    await user.click(screen.getByRole('link', { name: 'GRN-000001' }));

    expect(
      await screen.findByRole('heading', {
        name: 'GRN-000001 · Goods received',
      }),
    ).toBeTruthy();
    expect(
      screen.getByText('SUP-BENGAL · Bengal Polymer Traders'),
    ).toBeTruthy();
    // Challan, received and short, right-aligned.
    expect(screen.getByText('1.500 kg').className).toContain('text-right');
    expect(screen.getByText('+1998.500 kg')).toBeTruthy();
  });

  it('reverses a document only after a confirmed reason, then shows the reversal', async () => {
    let grn = stockDocument();
    const reasons: unknown[] = [];
    server.use(
      ...stockLookups(),
      http.get(`*/api/stock/documents/${grn.id}`, () => HttpResponse.json(grn)),
      http.post(
        `*/api/stock/documents/${grn.id}/reverse`,
        async ({ request }) => {
          reasons.push(await request.json());
          grn = {
            ...grn,
            reversedAt: '2026-10-14T06:00:00.000Z',
            reversible: false,
          };
          return HttpResponse.json(
            stockDocument({
              id: '00000000-0000-4000-8000-000000000299',
              number: 'REV-000001',
              kind: 'REVERSAL',
            }),
            { status: 201 },
          );
        },
      ),
    );
    const { user } = renderArea(<StockArea />, {
      mount,
      at: `/stock/documents/${grn.id}`,
    });

    await user.click(
      await screen.findByRole('button', { name: words.documents.reverse }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(
        'Reverse GRN-000001? Every line is booked back with a reversal document.',
      ),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole('button', { name: text.confirm.yes }),
    );
    expect(
      await within(dialog).findByText(words.documents.reasonRequired),
    ).toBeTruthy();
    expect(reasons).toEqual([]);

    await user.type(
      within(dialog).getByLabelText(words.documents.reverseReason),
      'Wrong supplier',
    );
    await user.click(
      within(dialog).getByRole('button', { name: text.confirm.yes }),
    );

    expect(
      await screen.findByRole('link', { name: 'REV-000001' }),
    ).toBeTruthy();
    expect(reasons).toEqual([{ reason: 'Wrong supplier' }]);
    expect(await screen.findByText(words.documents.reversed)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: words.documents.reverse }),
    ).toBeNull();
  });

  it.each([
    ['a storekeeper', 'STOREKEEPER', stockDocument()],
    [
      'a document the API will not reverse here',
      'MANAGER',
      stockDocument({ kind: 'DISPATCH', reversible: false }),
    ],
  ] as const)('offers no Reverse to %s', async (_case, role, document) => {
    server.use(
      ...stockLookups(),
      http.get(`*/api/stock/documents/${document.id}`, () =>
        HttpResponse.json(document),
      ),
    );
    renderArea(<StockArea />, {
      mount,
      at: `/stock/documents/${document.id}`,
      role,
    });

    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: words.documents.reverse }),
    ).toBeNull();
  });
});

describe('balances', () => {
  it('lists stock by code and opens the stock card with a running balance', async () => {
    server.use(
      ...stockLookups(),
      http.get('*/api/stock/balances', () =>
        HttpResponse.json(page([balance()])),
      ),
      http.get('*/api/stock/card', () =>
        HttpResponse.json(
          page([
            cardLine({
              entryId: 2,
              movementType: 'TRANSFER',
              documentId: '00000000-0000-4000-8000-000000000202',
              documentNumber: 'TRF-000001',
              grams: -250_000,
              balanceGrams: 750_000,
            }),
            cardLine(),
          ]),
        ),
      ),
    );
    const { user } = renderArea(<StockArea />, { mount, at: '/stock' });

    const quantity = await screen.findByText('1250.500 kg');
    expect(quantity.className).toContain('text-right');
    await user.click(screen.getByRole('link', { name: pp.code }));

    expect(await screen.findByText(words.card.title(pp.code))).toBeTruthy();
    expect(screen.getByRole('link', { name: 'TRF-000001' })).toBeTruthy();
    expect(screen.getByText('−250.000 kg')).toBeTruthy();
    expect(screen.getByText('750.000 kg')).toBeTruthy();
  });
});

describe('reports', () => {
  it('lists low stock with how much is short', async () => {
    server.use(
      ...stockLookups(),
      http.get('*/api/stock/low-stock', () =>
        HttpResponse.json([
          {
            rawMaterialId: pp.id,
            code: pp.code,
            name: pp.name,
            minimumStockGrams: 500_000,
            stockGrams: 120_000,
            shortByGrams: 380_000,
          },
        ]),
      ),
    );
    renderArea(<StockArea />, { mount, at: '/stock/low-stock' });

    expect(await screen.findByText('380.000 kg')).toBeTruthy();
    expect(screen.getByRole('link', { name: pp.code })).toBeTruthy();
  });

  it('shows shortages for a supplier and period, with the total', async () => {
    const asked: URLSearchParams[] = [];
    server.use(
      ...stockLookups(),
      http.get('*/api/stock/receipts/shortages', ({ request }) => {
        asked.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          items: [
            {
              documentId: stockDocument().id,
              documentNumber: 'GRN-000001',
              receivedOn: '2026-10-14',
              supplierId: supplier.id,
              supplierReference: 'BPT-5521',
              rawMaterialId: pp.id,
              challanGrams: 2_000_000,
              receivedGrams: 1_998_500,
              shortGrams: 1_500,
            },
          ],
          totalShortGrams: 1_500,
        });
      }),
    );
    const { user } = renderArea(<StockArea />, {
      mount,
      at: '/stock/shortages',
    });

    expect(await screen.findByText('Total short 1.500 kg')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'GRN-000001' })).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText(words.receive.supplier),
      supplier.id,
    );
    await waitFor(() => {
      expect(asked.at(-1)?.get('supplierId')).toBe(supplier.id);
      expect(asked.at(-1)?.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});

describe('who can post', () => {
  it.each([
    ['SUPERVISOR', []],
    ['STOREKEEPER', [words.actions.receive, words.actions.transfer]],
    [
      'MANAGER',
      [
        words.actions.receive,
        words.actions.transfer,
        words.actions.opening,
        words.actions.adjust,
      ],
    ],
  ] as [Role, string[]][])(
    'shows a %s only their actions',
    async (role, actions) => {
      server.use(
        ...stockLookups(),
        http.get('*/api/stock/balances', () => HttpResponse.json(page([]))),
      );
      renderArea(<StockArea />, { mount, at: '/stock', role });

      expect(await screen.findByText(text.list.noMatch)).toBeTruthy();
      const shown = Object.values(words.actions).filter(
        (label) => screen.queryByRole('link', { name: label }) !== null,
      );
      expect(shown).toEqual(actions);
    },
  );

  it('keeps a storekeeper out of adjustments typed into the address bar', async () => {
    server.use(...stockLookups());
    renderArea(<StockArea />, {
      mount,
      at: '/stock/adjust',
      role: 'STOREKEEPER',
    });

    expect(await screen.findByText(text.errors.noAccess)).toBeTruthy();
  });
});

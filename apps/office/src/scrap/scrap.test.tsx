import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { text } from '@/i18n';
import {
  balance,
  grindingBatch,
  page,
  product,
  rawMaterial,
  scrapSale,
  stockDocument,
} from '@/test/fixtures';
import { regrind } from '@/test/production-lookups';
import { renderArea } from '@/test/render';
import { server } from '@/test/server';
import { fgStore, scrapYard, store } from '@/test/stock-lookups';
import { ScrapArea } from './area';

const mount = '/scrap/*';
const words = text.scrap;
const cap = product();

function lookups() {
  return [
    http.get('*/api/locations', () =>
      HttpResponse.json(page([store, fgStore, scrapYard])),
    ),
    http.get('*/api/raw-materials', () =>
      HttpResponse.json(page([rawMaterial(), regrind])),
    ),
    http.get('*/api/products', () => HttpResponse.json(page([cap]))),
  ];
}

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

describe('grinding', () => {
  it('shows the loss while the weights are typed and posts the batch', async () => {
    server.use(...lookups());
    const calls = posting('*/api/scrap/grinding', grindingBatch());
    const { user } = renderArea(<ScrapArea />, {
      mount,
      at: '/scrap',
      role: 'SUPERVISOR',
    });
    const grinding = words.grinding;

    await user.selectOptions(
      await screen.findByLabelText(grinding.inputItem),
      regrind.id,
    );
    await user.type(screen.getByLabelText(grinding.inputKg), '10');
    await user.type(screen.getByLabelText(grinding.outputKg), '10.5');
    expect(screen.getByText(grinding.outputTooHeavy)).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: grinding.submit })
        .disabled,
    ).toBe(true);

    await user.clear(screen.getByLabelText(grinding.outputKg));
    await user.type(screen.getByLabelText(grinding.outputKg), '9.7');
    expect(screen.getByText(grinding.loss('0.300 kg', '3.00%'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: grinding.submit }));

    expect(await screen.findByText(grinding.posted('0.300 kg'))).toBeTruthy();
    expect(calls).toHaveLength(1);
    // The only scrap yard, store and regrind are chosen already.
    expect(calls[0].body).toEqual({
      scrapLocationId: scrapYard.id,
      storeLocationId: store.id,
      input: { itemType: 'RAW_MATERIAL', itemId: regrind.id, kilograms: '10' },
      outputMaterialId: regrind.id,
      outputKilograms: '9.7',
    });
  });

  it('weighs products ground by the piece', async () => {
    server.use(...lookups());
    const { user } = renderArea(<ScrapArea />, { mount, at: '/scrap' });
    const grinding = words.grinding;

    await user.click(await screen.findByLabelText(grinding.inputKinds.PRODUCT));
    await user.selectOptions(screen.getByLabelText(grinding.inputItem), cap.id);
    await user.type(screen.getByLabelText(grinding.inputPieces), '200');
    await user.type(screen.getByLabelText(grinding.outputKg), '0.48');

    // 200 caps of 2.5 g.
    expect(screen.getByText(grinding.inputWeighs('0.500 kg'))).toBeTruthy();
    expect(screen.getByText(grinding.loss('0.020 kg', '4.00%'))).toBeTruthy();
  });
});

describe('scrap products', () => {
  it('sends finished goods to the scrap yard with a reason', async () => {
    server.use(
      ...lookups(),
      http.get('*/api/stock/balances', () =>
        HttpResponse.json(
          page([
            balance({
              itemType: 'PRODUCT',
              itemId: cap.id,
              itemCode: cap.code,
              locationId: fgStore.id,
              grams: 1_250,
              pieces: 500,
            }),
          ]),
        ),
      ),
    );
    const calls = posting(
      '*/api/scrap/transfers',
      stockDocument({ number: 'SCT-000004', kind: 'SCRAP_TRANSFER' }),
    );
    const { user } = renderArea(<ScrapArea />, {
      mount,
      at: '/scrap/products',
    });
    const products = words.products;

    await user.selectOptions(
      await screen.findByLabelText(products.reason),
      'OBSOLETE',
    );
    await user.selectOptions(
      screen.getByLabelText(text.stock.item),
      `PRODUCT:${cap.id}`,
    );
    await user.type(screen.getByLabelText(/^Quantity/), '300');
    // The only finished goods store and scrap yard are chosen already.
    expect(
      await screen.findByText(text.stock.transfer.available('500 pcs')),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: products.submit }));

    expect(
      await screen.findByRole('link', { name: 'SCT-000004' }),
    ).toBeTruthy();
    expect(calls[0].body).toEqual({
      fromLocationId: fgStore.id,
      toLocationId: scrapYard.id,
      reason: 'OBSOLETE',
      lines: [{ productId: cap.id, pieces: 300 }],
    });
  });
});

describe('scrap sale', () => {
  it('adds up each line and the sale while it is typed', async () => {
    server.use(...lookups());
    const calls = posting(
      '*/api/scrap/sales',
      scrapSale({ amountPoisha: 11_170 }),
    );
    const { user } = renderArea(<ScrapArea />, { mount, at: '/scrap/sale' });
    const sale = words.sale;

    await user.type(
      await screen.findByLabelText(sale.buyer),
      'Karim Scrap Traders',
    );
    await user.selectOptions(
      screen.getByLabelText(text.stock.item),
      `RAW_MATERIAL:${regrind.id}`,
    );
    await user.type(screen.getByLabelText(/^Quantity/), '2.345');
    await user.type(screen.getByLabelText(sale.pricePerKg), '45.50');
    // 2.345 kg at 45.50 taka is 106.6975 taka.
    expect(screen.getByText('৳106.70')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: text.stock.addLine }));
    const second = screen.getAllByLabelText(text.stock.item)[1];
    await user.selectOptions(second, `PRODUCT:${cap.id}`);
    await user.type(screen.getAllByLabelText(/^Quantity/)[1], '100');
    await user.type(screen.getAllByLabelText(sale.pricePerKg)[1], '20');

    // 100 caps of 2.5 g at 20 taka a kg.
    expect(screen.getByText('৳5.00')).toBeTruthy();
    expect(screen.getByText(sale.totals('2.595 kg', '৳111.70'))).toBeTruthy();
    await user.click(screen.getByRole('button', { name: sale.submit }));

    expect(await screen.findByText(sale.posted('৳111.70'))).toBeTruthy();
    expect(calls[0].body).toEqual({
      buyerName: 'Karim Scrap Traders',
      scrapLocationId: scrapYard.id,
      lines: [
        {
          itemType: 'RAW_MATERIAL',
          itemId: regrind.id,
          kilograms: '2.345',
          pricePerKgPoisha: 4_550,
        },
        {
          itemType: 'PRODUCT',
          itemId: cap.id,
          pieces: 100,
          pricePerKgPoisha: 2_000,
        },
      ],
    });
  });
});

describe('reports', () => {
  function reports() {
    const asked: string[] = [];
    server.use(
      ...lookups(),
      http.get('*/api/scrap/grinding', () =>
        HttpResponse.json({
          totals: {
            batches: 1,
            inputGrams: 10_000,
            outputGrams: 9_700,
            lossGrams: 300,
            lossBasisPoints: 300,
          },
          batches: [grindingBatch()],
        }),
      ),
      http.get('*/api/scrap/sales', () => {
        asked.push('sales');
        return HttpResponse.json({
          totals: { sales: 1, grams: 2_345, amountPoisha: 10_670 },
          sales: [scrapSale()],
        });
      }),
      http.get('*/api/production/waste-report', ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('groupBy')!);
        return HttpResponse.json([
          {
            key: 'A',
            label: 'A',
            runnerGrams: 500,
            rejectGrams: 150,
            purgeGrams: 1_000,
            sweepingsGrams: 0,
            wasteGrams: 1_650,
            materialUsedGrams: 5_370,
            wasteBasisPoints: 3_073,
          },
        ]);
      }),
    );
    return asked;
  }

  it('shows grinding loss, scrap sales and waste for the dates chosen', async () => {
    const asked = reports();
    const { user } = renderArea(<ScrapArea />, {
      mount,
      at: '/scrap/reports?from=2026-10-01&to=2026-10-15',
    });

    const grinding = within(
      (
        await screen.findByRole('heading', { name: words.reports.grinding })
      ).closest('section')!,
    );
    expect(await grinding.findByText('RG-PP-01 10.000 kg')).toBeTruthy();
    expect(grinding.getAllByText('3.00%')).toHaveLength(2);
    const sales = within(
      screen
        .getByRole('heading', { name: words.reports.sales })
        .closest('section')!,
    );
    expect(await sales.findByText('Karim Scrap Traders')).toBeTruthy();
    expect(sales.getAllByText('৳106.70')).toHaveLength(2);
    expect(await screen.findByText('30.73%')).toBeTruthy();

    await user.selectOptions(
      screen.getByLabelText(words.reports.groupBy),
      'shift',
    );
    await waitFor(() => expect(asked.at(-1)).toBe('shift'));
  });

  it('shows no money, and asks for none, to a supervisor', async () => {
    const asked = reports();
    renderArea(<ScrapArea />, {
      mount,
      at: '/scrap/reports',
      role: 'SUPERVISOR',
    });

    expect(await screen.findByText('RG-PP-01 10.000 kg')).toBeTruthy();
    expect(await screen.findByText('30.73%')).toBeTruthy();
    expect(screen.queryByText(words.reports.sales)).toBeNull();
    expect(document.body.textContent).not.toContain('৳');
    expect(asked).not.toContain('sales');
    expect(screen.queryByRole('link', { name: words.tabs.sale })).toBeNull();
    expect(
      screen.queryByRole('link', { name: words.tabs.products }),
    ).toBeNull();
    // A supervisor may reverse a batch; a storekeeper may not.
    expect(screen.getByRole('button', { name: words.reverse })).toBeTruthy();
  });

  it('keeps the sale screen from anyone who may not see money', async () => {
    server.use(...lookups());
    renderArea(<ScrapArea />, {
      mount,
      at: '/scrap/sale',
      role: 'STOREKEEPER',
    });

    expect(await screen.findByText(text.errors.noAccess)).toBeTruthy();
    expect(screen.queryByLabelText(words.sale.pricePerKg)).toBeNull();
  });

  it('lets a storekeeper read grinding but not reverse it', async () => {
    reports();
    renderArea(<ScrapArea />, {
      mount,
      at: '/scrap/reports',
      role: 'STOREKEEPER',
    });

    expect(await screen.findByText('RG-PP-01 10.000 kg')).toBeTruthy();
    expect(screen.queryByRole('button', { name: words.reverse })).toBeNull();
  });
});

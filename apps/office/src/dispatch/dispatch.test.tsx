import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { Challan, Role } from '@/api/types';
import { text } from '@/i18n';
import {
  balance,
  challan,
  company,
  page,
  partner,
  product,
  salesOrder,
} from '@/test/fixtures';
import { renderArea } from '@/test/render';
import { server } from '@/test/server';
import { fgStore, scrapYard } from '@/test/stock-lookups';
import { DispatchArea } from './area';
import { GatePassPage } from './gate-pass';

const mount = '/dispatch/*';
const words = text.dispatch;
const cap = product();
const passed = challan({
  gatePassStatus: 'PASSED',
  gatePassedAt: '2026-10-15T06:00:00.000Z',
  gatePassedById: '00000000-0000-4000-8000-000000000003',
});

function lookups() {
  return [
    http.get('*/api/customers', () => HttpResponse.json(page([partner()]))),
    http.get('*/api/products', () => HttpResponse.json(page([cap]))),
    http.get('*/api/locations', () =>
      HttpResponse.json(page([fgStore, scrapYard])),
    ),
    http.get('*/api/settings/company', () => HttpResponse.json(company())),
  ];
}

function challanPage(current: Challan) {
  server.use(
    ...lookups(),
    http.get(`*/api/dispatch/challans/${current.id}`, () =>
      HttpResponse.json(current),
    ),
  );
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

describe('challan list', () => {
  it('shows each challan and filters by customer, dispatch date and gate pass', async () => {
    const asked: URLSearchParams[] = [];
    server.use(
      ...lookups(),
      http.get('*/api/dispatch/challans', ({ request }) => {
        asked.push(new URL(request.url).searchParams);
        return HttpResponse.json(page([challan()]));
      }),
    );
    const { user } = renderArea(<DispatchArea />, { mount, at: '/dispatch' });

    const row = (
      await screen.findByRole('link', { name: 'DC-000012' })
    ).closest('tr')!;
    expect(within(row).getByText(partner().name)).toBeTruthy();
    expect(within(row).getByText(partner().code)).toBeTruthy();
    expect(within(row).getByText('24,040 pcs')).toBeTruthy();
    expect(within(row).getByText(words.gatePassStatuses.PENDING)).toBeTruthy();

    await user.selectOptions(
      screen.getByLabelText(words.customer),
      partner().id,
    );
    await user.type(screen.getByLabelText(words.from), '2026-10-01');
    await user.selectOptions(screen.getByLabelText(words.gatePass), 'PASSED');

    await waitFor(() => expect(asked.at(-1)?.get('gatePass')).toBe('PASSED'));
    expect(asked.at(-1)?.get('customerId')).toBe(partner().id);
    expect(asked.at(-1)?.get('from')).toBe('2026-10-01');
  });

  it.each<[Role, boolean]>([
    ['STOREKEEPER', true],
    ['SUPERVISOR', false],
  ])('offers a new challan to a %s: %s', async (role, offered) => {
    server.use(
      ...lookups(),
      http.get('*/api/dispatch/challans', () =>
        HttpResponse.json(page([challan()])),
      ),
    );
    renderArea(<DispatchArea />, { mount, at: '/dispatch', role });

    await screen.findByRole('link', { name: 'DC-000012' });
    expect(screen.queryByRole('link', { name: words.new }) !== null).toBe(
      offered,
    );
  });
});

describe('new challan', () => {
  const order = salesOrder({
    status: 'IN_PRODUCTION',
    overDeliveryBasisPoints: 200,
  });

  it('fills each line with what is left and allows no more than the tolerance', async () => {
    server.use(
      ...lookups(),
      http.get('*/api/sales-orders', ({ request }) => {
        const status = new URL(request.url).searchParams.get('status');
        return HttpResponse.json(
          page(status === 'IN_PRODUCTION' ? [order] : []),
        );
      }),
      http.get(`*/api/sales-orders/${order.id}/delivery`, () =>
        HttpResponse.json({
          orderId: order.id,
          number: order.number,
          status: order.status,
          overDeliveryBasisPoints: 200,
          shortCloseReason: null,
          lines: [
            {
              lineNo: 1,
              productId: cap.id,
              code: cap.code,
              orderedPieces: 200_000,
              deliveredPieces: 150_000,
              returnedPieces: 0,
              remainingPieces: 50_000,
              // 2% over 200,000 is 204,000, less the 150,000 delivered.
              allowedPieces: 54_000,
            },
          ],
        }),
      ),
      http.get('*/api/stock/balances', () =>
        HttpResponse.json(
          page([
            balance({
              itemType: 'PRODUCT',
              itemId: cap.id,
              itemCode: cap.code,
              locationId: fgStore.id,
              grams: 150_000,
              pieces: 60_000,
            }),
          ]),
        ),
      ),
      http.get(`*/api/dispatch/challans/${challan().id}`, () =>
        HttpResponse.json(challan()),
      ),
    );
    const calls = posting('*/api/dispatch/challans', challan());
    const { user } = renderArea(<DispatchArea />, {
      mount,
      at: '/dispatch/new',
      role: 'STOREKEEPER',
    });

    await user.selectOptions(
      await screen.findByLabelText(words.order),
      order.id,
    );
    const pieces = await screen.findByLabelText<HTMLInputElement>(
      words.piecesOf(cap.code),
    );
    expect(pieces.value).toBe('50000');
    expect(screen.getByText(words.stillToDeliver('50,000 pcs'))).toBeTruthy();
    // The only finished goods store is chosen, so its stock shows at once.
    expect(await screen.findByText(words.inStore('60,000 pcs'))).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>(words.address).value).toBe(
      partner().address,
    );

    await user.clear(pieces);
    await user.type(pieces, '54001');
    await user.type(
      screen.getByLabelText(words.vehicle),
      'DHAKA METRO-TA 11-2345',
    );
    await user.type(screen.getByLabelText(words.driverName), 'Abdul Karim');
    await user.type(screen.getByLabelText(words.driverPhone), '01812345678');
    await user.click(screen.getByRole('button', { name: words.create }));

    expect(await screen.findByText(words.overLimit('54,000 pcs'))).toBeTruthy();
    expect(calls).toHaveLength(0);

    await user.clear(pieces);
    await user.type(pieces, '54000');
    await user.click(screen.getByRole('button', { name: words.create }));

    expect(
      await screen.findByRole('heading', { name: 'DC-000012' }),
    ).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({
      orderId: order.id,
      fromLocationId: fgStore.id,
      vehicleNumber: 'DHAKA METRO-TA 11-2345',
      driverName: 'Abdul Karim',
      driverPhone: '01812345678',
      deliveryAddress: partner().address,
      notes: null,
      lines: [{ productId: cap.id, pieces: 54_000 }],
    });
    expect(calls[0].key).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('challan page', () => {
  const jar = {
    challanId: challan().id,
    productId: '00000000-0000-4000-8000-0000000000b2',
    pieces: 300,
    returnedPieces: 0,
    code: 'JAR-1L',
    name: '1 litre jar',
    piecesPerCarton: 24,
  };

  it('prints a customer, office and gate copy with cartons, the total and the BIN', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    challanPage(challan({ lines: [...challan().lines, jar] }));
    server.use(
      http.get('*/api/settings/company', () =>
        HttpResponse.json(company({ bin: '0012345678901' })),
      ),
    );
    const { user } = renderArea(<DispatchArea />, {
      mount,
      at: `/dispatch/${challan().id}`,
    });

    await user.click(await screen.findByRole('button', { name: words.print }));

    expect(print).toHaveBeenCalledOnce();
    const copies = screen.getAllByRole('region');
    expect(copies.map((copy) => copy.getAttribute('aria-label'))).toEqual([
      words.printout.copies.customer,
      words.printout.copies.office,
      words.printout.copies.gate,
    ]);
    for (const copy of copies.map((region) => within(region))) {
      expect(copy.getByText(company().name)).toBeTruthy();
      expect(copy.getByText('BIN: 0012345678901')).toBeTruthy();
      // 24,040 caps at 2,000 a carton; 300 jars at 24.
      expect(copy.getByText('12 ctn + 40 pcs')).toBeTruthy();
      expect(copy.getByText('12 ctn + 12 pcs')).toBeTruthy();
      expect(copy.getByText('24,340 pcs')).toBeTruthy();
      expect(copy.getByText('DHAKA METRO-TA 11-2345')).toBeTruthy();
      expect(copy.getByText(salesOrder().customerPo!)).toBeTruthy();
      expect(copy.getByText(words.printout.receivedBy)).toBeTruthy();
    }
    print.mockRestore();
  });

  it('prints no BIN when the company has none', async () => {
    challanPage(challan());
    renderArea(<DispatchArea />, { mount, at: `/dispatch/${challan().id}` });

    const [copy] = await screen.findAllByRole('region');
    expect(within(copy).getByText(company().name)).toBeTruthy();
    expect(within(copy).queryByText(/BIN/)).toBeNull();
    expect(screen.queryByText(words.noCompany)).toBeNull();
  });

  it('says so when the company details are not set yet', async () => {
    challanPage(challan());
    server.use(
      http.get('*/api/settings/company', () =>
        HttpResponse.json(company({ name: '', address: '', phone: '' })),
      ),
    );
    renderArea(<DispatchArea />, { mount, at: `/dispatch/${challan().id}` });

    expect(await screen.findByText(words.noCompany)).toBeTruthy();
  });

  it('records a return only once a settlement is chosen', async () => {
    challanPage(passed);
    const calls = posting('*/api/dispatch/returns', {});
    const { user } = renderArea(<DispatchArea />, {
      mount,
      at: `/dispatch/${passed.id}`,
    });

    await user.click(
      await screen.findByRole('link', { name: words.recordReturn }),
    );
    const back = await screen.findByLabelText(words.returning(cap.code));
    await user.type(back, '24041');
    await user.selectOptions(
      screen.getByLabelText(words.destination),
      scrapYard.id,
    );
    await user.selectOptions(screen.getByLabelText(words.reason), 'DAMAGED');
    await user.click(screen.getByRole('button', { name: words.submitReturn }));

    expect(await screen.findByText(words.chooseSettlement)).toBeTruthy();
    expect(screen.getByText(words.tooMany('24,040 pcs'))).toBeTruthy();
    expect(calls).toHaveLength(0);

    await user.clear(back);
    await user.type(back, '40');
    await user.click(
      screen.getByRole('radio', {
        name: new RegExp(`^${words.settlements.CREDIT}`),
      }),
    );
    await user.click(screen.getByRole('button', { name: words.submitReturn }));

    expect(
      await screen.findByRole('heading', { name: passed.number }),
    ).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toEqual({
      challanId: passed.id,
      toLocationId: scrapYard.id,
      reason: 'DAMAGED',
      settlement: 'CREDIT',
      lines: [{ productId: cap.id, pieces: 40 }],
    });
  });

  it('reverses a return after asking why', async () => {
    challanPage(
      challan({
        ...passed,
        returns: [
          {
            id: '00000000-0000-4000-8000-000000000851',
            number: 'CRN-000003',
            stockDocumentId: '00000000-0000-4000-8000-000000000206',
            challanId: passed.id,
            toLocationId: fgStore.id,
            reason: 'QUALITY',
            settlement: 'REPLACE',
            returnedOn: '2026-10-16',
            reversedAt: null,
            recordedById: '00000000-0000-4000-8000-000000000001',
            createdAt: '2026-10-16T04:00:00.000Z',
            lines: [
              {
                returnId: '00000000-0000-4000-8000-000000000851',
                productId: cap.id,
                pieces: 40,
              },
            ],
          },
        ],
      }),
    );
    const calls = posting(
      '*/api/dispatch/returns/00000000-0000-4000-8000-000000000851/reverse',
      {},
    );
    const { user } = renderArea(<DispatchArea />, {
      mount,
      at: `/dispatch/${passed.id}`,
    });

    const row = (
      await screen.findByRole('link', { name: 'CRN-000003' })
    ).closest('tr')!;
    expect(within(row).getByText(words.settlements.REPLACE)).toBeTruthy();
    await user.click(within(row).getByRole('button', { name: words.reverse }));
    expect(
      screen.getByText(words.confirmReverseReturn('CRN-000003')),
    ).toBeTruthy();
    await user.type(
      screen.getByLabelText(words.reverseReason),
      'Counted twice',
    );
    await user.click(screen.getByRole('button', { name: text.confirm.yes }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toEqual({ reason: 'Counted twice' });
  });

  it.each<[Role, Challan, string, boolean]>([
    ['MANAGER', challan(), words.reverse, true],
    ['STOREKEEPER', challan(), words.reverse, false],
    ['MANAGER', passed, words.recordReturn, true],
    ['SUPERVISOR', passed, words.recordReturn, false],
  ])(
    'shows a %s the %s challan actions they may take',
    async (role, current, action, shown) => {
      challanPage(current);
      renderArea(<DispatchArea />, {
        mount,
        at: `/dispatch/${current.id}`,
        role,
      });

      await screen.findByRole('button', { name: words.print });
      expect(screen.queryByText(action) !== null).toBe(shown);
    },
  );
});

describe('gate pass', () => {
  it('lets the guard pass a truck after checking its vehicle number', async () => {
    let waiting = [challan()];
    const calls: { url: string; key: string | null }[] = [];
    server.use(
      http.get('*/api/dispatch/gate-passes/pending', () =>
        HttpResponse.json(waiting),
      ),
      http.post('*/api/dispatch/challans/:id/gate-pass', ({ request }) => {
        calls.push({
          url: request.url,
          key: request.headers.get('Idempotency-Key'),
        });
        waiting = [];
        return HttpResponse.json(passed);
      }),
    );
    const { user } = renderArea(<GatePassPage />, {
      mount: '/gate/*',
      at: '/gate',
      role: 'GUARD',
    });

    const card = within(
      await screen.findByRole('article', { name: 'DC-000012' }),
    );
    expect(card.getByText('DHAKA METRO-TA 11-2345')).toBeTruthy();
    expect(card.getByText('12 ctn + 40 pcs')).toBeTruthy();
    await user.click(card.getByRole('button', { name: text.gate.pass }));
    expect(
      screen.getByText(
        text.gate.confirm('DC-000012', 'DHAKA METRO-TA 11-2345'),
      ),
    ).toBeTruthy();
    expect(calls).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: text.confirm.yes }));

    expect(await screen.findByText(text.gate.passed('DC-000012'))).toBeTruthy();
    expect(await screen.findByText(text.gate.empty)).toBeTruthy();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain(
      `/dispatch/challans/${challan().id}/gate-pass`,
    );
    expect(calls[0].key).toMatch(/^[0-9a-f-]{36}$/);
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Role, SalesOrder, SalesOrderStatus } from '@/api/types';
import { text } from '@/i18n';
import { challan, page, partner, product, salesOrder } from '@/test/fixtures';
import { productionLookups } from '@/test/production-lookups';
import { renderArea } from '@/test/render';
import { server } from '@/test/server';
import { OrdersArea } from './area';

const mount = '/orders/*';
const words = text.orders;
const cap = product();

/** The reads an order page makes, answering with `order` as it is now. */
function orderPage(current: () => SalesOrder, materialCheck?: () => Response) {
  return [
    http.get(`*/api/sales-orders/${salesOrder().id}`, () =>
      HttpResponse.json(current()),
    ),
    http.get(`*/api/sales-orders/${salesOrder().id}/delivery`, () =>
      HttpResponse.json({
        orderId: current().id,
        number: current().number,
        status: current().status,
        overDeliveryBasisPoints: 0,
        shortCloseReason: null,
        lines: [
          {
            lineNo: 1,
            productId: cap.id,
            code: cap.code,
            orderedPieces: 200_000,
            deliveredPieces: 150_000,
            returnedPieces: 2_000,
            remainingPieces: 50_000,
            allowedPieces: 50_000,
          },
        ],
      }),
    ),
    http.get(`*/api/sales-orders/${salesOrder().id}/material-check`, () =>
      materialCheck
        ? materialCheck()
        : HttpResponse.json({
            orderId: current().id,
            number: current().number,
            products: [],
            materials: [
              {
                rawMaterialId: '00000000-0000-4000-8000-0000000000a1',
                code: 'RM-PP-01',
                name: 'PP homopolymer',
                neededGrams: 515_000,
                availableGrams: 300_000,
                shortageGrams: 215_000,
              },
            ],
          }),
    ),
    http.get('*/api/job-cards', () => HttpResponse.json(page([]))),
    http.get('*/api/dispatch/challans', () =>
      HttpResponse.json(page([challan()])),
    ),
  ];
}

describe('order list', () => {
  it('marks late orders in red and filters to them', async () => {
    const asked: URLSearchParams[] = [];
    const late = salesOrder({
      status: 'CONFIRMED',
      late: true,
      deliveryDate: '2026-10-01',
    });
    const onTime = salesOrder({
      id: '00000000-0000-4000-8000-000000000402',
      number: 'SO-000002',
    });
    server.use(
      ...productionLookups(),
      http.get('*/api/sales-orders', ({ request }) => {
        asked.push(new URL(request.url).searchParams);
        return HttpResponse.json(page([late, onTime]));
      }),
    );
    const { user } = renderArea(<OrdersArea />, { mount, at: '/orders' });

    const lateRow = (
      await screen.findByRole('link', { name: 'SO-000001' })
    ).closest('tr')!;
    expect(lateRow.className).toContain('border-l-destructive');
    expect(within(lateRow).getByText(words.late)).toBeTruthy();
    const onTimeRow = screen
      .getByRole('link', { name: 'SO-000002' })
      .closest('tr')!;
    expect(within(onTimeRow).queryByText(words.late)).toBeNull();

    await user.click(screen.getByLabelText(words.lateOnly));
    await waitFor(() => expect(asked.at(-1)?.get('late')).toBe('true'));

    await user.click(screen.getByLabelText(words.openOnly));
    await waitFor(() => expect(asked.at(-1)?.get('open')).toBe('true'));
  });

  it('offers New only to owners and managers', async () => {
    server.use(
      ...productionLookups(),
      http.get('*/api/sales-orders', () =>
        HttpResponse.json(page([salesOrder()])),
      ),
    );
    renderArea(<OrdersArea />, { mount, at: '/orders', role: 'STOREKEEPER' });

    expect(await screen.findByRole('link', { name: 'SO-000001' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: words.new })).toBeNull();
  });
});

describe('order form', () => {
  it('creates a draft with prices in taka and the allowance in percent', async () => {
    const bodies: unknown[] = [];
    server.use(
      ...productionLookups(),
      ...orderPage(() => salesOrder()),
      http.post('*/api/sales-orders', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(salesOrder(), { status: 201 });
      }),
    );
    const { user } = renderArea(<OrdersArea />, { mount, at: '/orders/new' });

    await user.selectOptions(
      await screen.findByLabelText(words.customer),
      partner().id,
    );
    await user.type(screen.getByLabelText(words.deliveryDate), '2026-10-30');
    await user.clear(screen.getByLabelText(words.tolerance));
    await user.type(screen.getByLabelText(words.tolerance), '2');
    await user.selectOptions(screen.getByLabelText(words.product), cap.id);
    await user.type(screen.getByLabelText(words.pieces), '200000');
    await user.type(screen.getByLabelText(words.price), '0.85');
    await user.click(screen.getByRole('button', { name: words.save }));

    expect(
      await screen.findByRole('heading', { name: /SO-000001/ }),
    ).toBeTruthy();
    expect(bodies[0]).toMatchObject({
      customerId: partner().id,
      deliveryDate: '2026-10-30',
      customerPo: null,
      overDeliveryBasisPoints: 200,
      lines: [{ productId: cap.id, pieces: 200_000, unitPricePoisha: 85 }],
    });
  });

  it('lets a confirmed order change only pieces, delivery date and allowance', async () => {
    const order = salesOrder({ status: 'CONFIRMED' });
    const bodies: unknown[] = [];
    server.use(
      ...productionLookups(),
      ...orderPage(() => order),
      http.patch(`*/api/sales-orders/${order.id}`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(order);
      }),
    );
    const { user } = renderArea(<OrdersArea />, {
      mount,
      at: `/orders/${order.id}/edit`,
    });

    expect(await screen.findByText(words.confirmedRule)).toBeTruthy();
    expect(
      screen.getByLabelText<HTMLInputElement>(words.product).readOnly,
    ).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>(words.price).readOnly).toBe(
      true,
    );
    expect(screen.queryByRole('button', { name: words.addLine })).toBeNull();
    await user.clear(screen.getByLabelText(words.pieces));
    await user.type(screen.getByLabelText(words.pieces), '250000');
    await user.click(screen.getByRole('button', { name: words.save }));

    expect(
      await screen.findByRole('heading', { name: /SO-000001/ }),
    ).toBeTruthy();
    expect(bodies).toEqual([
      {
        deliveryDate: '2026-10-30',
        overDeliveryBasisPoints: 0,
        lines: [{ productId: cap.id, pieces: 250_000, unitPricePoisha: 85 }],
      },
    ]);
  });
});

describe('order page', () => {
  it('confirms, starts and closes short an order, asking for a reason at the end', async () => {
    let order = salesOrder();
    const steps: string[] = [];
    const move = (step: string, status: SalesOrder['status']) =>
      http.post(
        `*/api/sales-orders/${order.id}/${step}`,
        async ({ request }) => {
          steps.push(
            step === 'close-short'
              ? `${step}: ${((await request.json()) as { reason: string }).reason}`
              : step,
          );
          order = { ...order, status };
          return HttpResponse.json(order);
        },
      );
    server.use(
      ...productionLookups(),
      ...orderPage(() => order),
      move('confirm', 'CONFIRMED'),
      move('start-production', 'IN_PRODUCTION'),
      move('close-short', 'COMPLETED'),
    );
    const { user } = renderArea(<OrdersArea />, {
      mount,
      at: `/orders/${order.id}`,
    });

    await user.click(
      await screen.findByRole('button', { name: words.confirm }),
    );
    await user.click(
      await screen.findByRole('button', { name: words.startProduction }),
    );
    await user.click(
      await screen.findByRole('button', { name: words.closeShort }),
    );
    const dialog = await screen.findByRole('alertdialog');
    await user.click(
      within(dialog).getByRole('button', { name: text.confirm.yes }),
    );
    expect(await within(dialog).findByText(words.reasonRequired)).toBeTruthy();
    await user.type(
      within(dialog).getByLabelText(words.reason),
      'Customer needs no more',
    );
    await user.click(
      within(dialog).getByRole('button', { name: text.confirm.yes }),
    );

    expect(await screen.findByText(words.statuses.COMPLETED)).toBeTruthy();
    expect(steps).toEqual([
      'confirm',
      'start-production',
      'close-short: Customer needs no more',
    ]);
  });

  it('shows delivery per line and the material short in red', async () => {
    server.use(
      ...productionLookups(),
      ...orderPage(() => salesOrder({ status: 'CONFIRMED' })),
    );
    renderArea(<OrdersArea />, { mount, at: `/orders/${salesOrder().id}` });

    expect(await screen.findByText('50,000 pcs')).toBeTruthy();
    const short = await screen.findByText('215.000 kg');
    expect(short.className).toContain('text-destructive');
    expect(screen.getByText('515.000 kg').closest('td')!.className).toContain(
      'text-right',
    );
  });

  it('warns in amber when a product has no active formula', async () => {
    server.use(
      ...productionLookups(),
      ...orderPage(
        () => salesOrder({ status: 'CONFIRMED' }),
        () =>
          HttpResponse.json(
            { statusCode: 409, message: 'No active formula for CAP-28' },
            { status: 409 },
          ),
      ),
    );
    renderArea(<OrdersArea />, { mount, at: `/orders/${salesOrder().id}` });

    const warning = await screen.findByText('No active formula for CAP-28');
    expect(warning.className).toContain('amber');
  });

  it('shows no status buttons to a storekeeper', async () => {
    server.use(...productionLookups(), ...orderPage(() => salesOrder()));
    renderArea(<OrdersArea />, {
      mount,
      at: `/orders/${salesOrder().id}`,
      role: 'STOREKEEPER',
    });

    expect(await screen.findByText('50,000 pcs')).toBeTruthy();
    for (const label of [words.confirm, words.edit, words.cancel]) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
      expect(screen.queryByRole('link', { name: label })).toBeNull();
    }
  });
});

describe('order challans', () => {
  it('links each challan, and lets a storekeeper start the next one', async () => {
    server.use(
      ...productionLookups(),
      ...orderPage(() => salesOrder({ status: 'IN_PRODUCTION' })),
    );
    renderArea(<OrdersArea />, {
      mount,
      at: `/orders/${salesOrder().id}`,
      role: 'STOREKEEPER',
    });

    const link = await screen.findByRole('link', { name: 'DC-000012' });
    expect(link.getAttribute('href')).toBe(`/dispatch/${challan().id}`);
    expect(
      screen
        .getByRole('link', { name: text.dispatch.new })
        .getAttribute('href'),
    ).toBe(`/dispatch/new?order=${salesOrder().id}`);
  });

  it.each<[Role, SalesOrderStatus]>([
    ['STOREKEEPER', 'DRAFT'],
    ['SUPERVISOR', 'IN_PRODUCTION'],
  ])('offers a %s no new challan on a %s order', async (role, status) => {
    server.use(
      ...productionLookups(),
      ...orderPage(() => salesOrder({ status })),
    );
    renderArea(<OrdersArea />, {
      mount,
      at: `/orders/${salesOrder().id}`,
      role,
    });

    await screen.findByRole('link', { name: 'DC-000012' });
    expect(screen.queryByRole('link', { name: text.dispatch.new })).toBeNull();
  });
});

describe('buy list', () => {
  it('lists what to buy and names products with no formula', async () => {
    server.use(
      http.get('*/api/sales-orders/material-shortages', () =>
        HttpResponse.json({
          products: [
            {
              productId: cap.id,
              code: cap.code,
              orderedPieces: 200_000,
              fromStockPieces: 60_000,
              toProducePieces: 140_000,
              formulaVersion: 1,
            },
          ],
          materials: [
            {
              rawMaterialId: '00000000-0000-4000-8000-0000000000a1',
              code: 'RM-PP-01',
              name: 'PP homopolymer',
              neededGrams: 360_500,
              availableGrams: 300_000,
              shortageGrams: 60_500,
            },
          ],
          missingFormulas: [
            {
              productId: '00000000-0000-4000-8000-0000000000b2',
              code: 'CAP-38',
            },
          ],
        }),
      ),
    );
    renderArea(<OrdersArea />, { mount, at: '/orders/buy-list' });

    expect(
      (await screen.findByText(words.missingFormulas('CAP-38'))).className,
    ).toContain('amber');
    expect(screen.getByText('60.500 kg').className).toContain(
      'text-destructive',
    );
    expect(screen.getByText('1,40,000 pcs')).toBeTruthy();
  });
});

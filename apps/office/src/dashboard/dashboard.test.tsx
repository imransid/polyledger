import { screen, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type {
  LeakFigures,
  OrderFigures,
  StockFigures,
  TodayFigures,
  WaitingChallan,
} from '@/api/types';
import { text } from '@/i18n';
import { HomePage } from '@/pages/home-page';
import { renderArea } from '@/test/render';
import { server } from '@/test/server';

const words = text.dashboard;
const days = [
  '2026-10-09',
  '2026-10-10',
  '2026-10-11',
  '2026-10-12',
  '2026-10-13',
  '2026-10-14',
  '2026-10-15',
];

const today: TodayFigures = {
  day: '2026-10-15',
  goodPieces: 1_000,
  rejectedPieces: 40,
  rejectBasisPoints: 385,
  machines: { running: 1, idle: 1, repair: 1 },
};
const orders: OrderFigures = {
  today: '2026-10-15',
  dueBy: '2026-10-21',
  open: { DRAFT: 1, CONFIRMED: 7, IN_PRODUCTION: 1 },
  lateCount: 6,
  mostLate: [
    {
      id: '00000000-0000-4000-8000-000000000401',
      number: 'SO-000001',
      customerCode: 'CUS-PADMA',
      deliveryDate: '2026-10-09',
      daysLate: 6,
    },
  ],
  dueCount: 2,
};
const stock: StockFigures = {
  lowStockCount: 1,
  finishedGoodsPieces: 5_900,
  finishedGoodsStores: [
    {
      locationId: '00000000-0000-4000-8000-000000000103',
      code: 'FG-STORE',
      name: 'Finished goods store',
      pieces: 5_900,
    },
  ],
};
const leaks: LeakFigures = {
  from: '2026-10-09',
  to: '2026-10-15',
  closedJobCards: 2,
  differenceGrams: 18_230,
  worstJobCards: [
    {
      jobCardId: '00000000-0000-4000-8000-000000000501',
      number: 'JC-000001',
      productCode: 'CAP-28',
      issuedGrams: 20_500,
      differenceGrams: 16_380,
      differenceBasisPoints: 7_990,
    },
    {
      jobCardId: '00000000-0000-4000-8000-000000000502',
      number: 'JC-000002',
      productCode: 'CAP-28',
      issuedGrams: 2_100,
      differenceGrams: -150,
      differenceBasisPoints: -714,
    },
  ],
  wasteByDay: days.map((day) =>
    day === '2026-10-15'
      ? {
          day,
          wasteGrams: 1_500,
          materialUsedGrams: 4_370,
          wasteBasisPoints: 3_432,
        }
      : { day, wasteGrams: 0, materialUsedGrams: 0, wasteBasisPoints: null },
  ),
  shortageGrams: 500,
  grindingLossGrams: 40,
};
const gate: WaitingChallan[] = [
  {
    id: '00000000-0000-4000-8000-000000000801',
    number: 'DC-000012',
    customerCode: 'CUS-PADMA',
    vehicleNumber: 'DHAKA METRO-TA 11-2345',
    waitingMinutes: 125,
    waitedTooLong: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000802',
    number: 'DC-000013',
    customerCode: 'CUS-PADMA',
    vehicleNumber: 'DHAKA METRO-TA 22-1111',
    waitingMinutes: 10,
    waitedTooLong: false,
  },
];

/** Every card's endpoint, counting the calls each one gets. */
function dashboardApi() {
  const asked: string[] = [];
  const answer = (card: string, figures: object) =>
    http.get(`*/api/dashboard/${card}`, () => {
      asked.push(card);
      return HttpResponse.json(figures);
    });
  server.use(
    answer('today', today),
    answer('orders', orders),
    answer('stock', stock),
    answer('leaks', leaks),
    answer('gate', gate),
  );
  return asked;
}

function renderHome(role: 'OWNER' | 'MANAGER' | 'SUPERVISOR' = 'OWNER') {
  return renderArea(<HomePage />, { mount: '/*', at: '/', role });
}

const card = (title: string) =>
  within(screen.getByRole('region', { name: title }));
const href = (link: HTMLElement) => link.getAttribute('href');

describe('dashboard', () => {
  it("links today's figures to the machine board", async () => {
    dashboardApi();
    renderHome();

    const todayCard = within(
      await screen.findByRole('region', { name: words.todayCard.title }),
    );
    const good = await todayCard.findByRole('link', { name: /Good pieces/ });
    expect(good.textContent).toContain('1,000 pcs');
    expect(href(good)).toBe('/production/board');
    const rejects = todayCard.getByRole('link', { name: /Rejected/ });
    expect(rejects.textContent).toContain('3.85%');
    expect(href(rejects)).toBe('/production/board');
    expect(href(todayCard.getByRole('link', { name: /In repair/ }))).toBe(
      '/production/board',
    );
  });

  it('opens the order lists that hold the same orders as each number', async () => {
    dashboardApi();
    renderHome('MANAGER');

    const ordersCard = within(
      await screen.findByRole('region', { name: words.orders.title }),
    );
    const open = await ordersCard.findByRole('link', { name: /Open orders/ });
    expect(open.textContent).toContain('9');
    expect(href(open)).toBe('/orders?open=true');
    const late = ordersCard.getByRole('link', { name: /^6\s*Late$/ });
    expect(href(late)).toBe('/orders?late=true');
    expect(late.innerHTML).toContain('text-destructive');
    expect(
      href(ordersCard.getByRole('link', { name: /Due in the next 7 days/ })),
    ).toBe('/orders?open=true&from=2026-10-15&to=2026-10-21');
    expect(href(ordersCard.getByRole('link', { name: '1 draft' }))).toBe(
      '/orders?status=DRAFT',
    );
    const mostLate = ordersCard.getByRole('link', { name: /SO-000001/ });
    expect(href(mostLate)).toBe(`/orders/${orders.mostLate[0].id}`);
    expect(mostLate.textContent).toContain(words.orders.daysLate(6));
  });

  it('opens low stock and each finished goods store', async () => {
    dashboardApi();
    renderHome();

    const stockCard = within(
      await screen.findByRole('region', { name: words.stock.title }),
    );
    expect(
      href(await stockCard.findByRole('link', { name: /below their minimum/ })),
    ).toBe('/stock/low-stock');
    expect(href(stockCard.getByRole('link', { name: /FG-STORE/ }))).toBe(
      `/stock/balances?location=${stock.finishedGoodsStores[0].locationId}&type=PRODUCT`,
    );
  });

  it('shows the worst job cards with their share of material issued, and the waste trend', async () => {
    dashboardApi();
    renderHome();

    const leaksCard = within(
      await screen.findByRole('region', { name: words.leaks.title }),
    );
    expect(await leaksCard.findByText('+18.230 kg')).toBeTruthy();
    const worst = leaksCard.getByRole('link', { name: 'JC-000001' });
    expect(href(worst)).toBe(`/production/${leaks.worstJobCards[0].jobCardId}`);
    const worstRow = within(worst.closest('tr')!);
    expect(worstRow.getByText('+16.380 kg')).toBeTruthy();
    expect(worstRow.getByText('+79.90%')).toBeTruthy();
    const overUsed = within(
      leaksCard.getByRole('link', { name: 'JC-000002' }).closest('tr')!,
    );
    expect(overUsed.getByText('−0.150 kg')).toBeTruthy();
    expect(overUsed.getByText('−7.14%')).toBeTruthy();
    expect(href(leaksCard.getByRole('link', { name: /GRN shortages/ }))).toBe(
      '/stock/shortages?from=2026-10-09&to=2026-10-15',
    );
    expect(href(leaksCard.getByRole('link', { name: /Grinding loss/ }))).toBe(
      '/scrap/reports?from=2026-10-09&to=2026-10-15',
    );

    expect(
      href(leaksCard.getByRole('link', { name: words.leaks.wasteByDay })),
    ).toBe('/scrap/reports?from=2026-10-09&to=2026-10-15&group=day');
    const bars = within(
      leaksCard.getByRole('list', { name: words.leaks.wasteByDay }),
    ).getAllByRole('listitem');
    expect(bars).toHaveLength(7);
    expect(bars[0].getAttribute('aria-label')).toBe('9 Oct');
    expect(within(bars[0]).getByText('–')).toBeTruthy();
    expect(within(bars[6]).getByText('34.32%')).toBeTruthy();
  });

  it('marks in amber a challan waiting more than an hour for the gate', async () => {
    dashboardApi();
    renderHome();

    const gateCard = within(
      await screen.findByRole('region', { name: words.gate.title }),
    );
    expect(
      href(
        await gateCard.findByRole('link', { name: /Waiting for a gate pass/ }),
      ),
    ).toBe('/gate');
    const long = gateCard.getByRole('link', { name: /DC-000012/ });
    expect(href(long)).toBe(`/dispatch/${gate[0].id}`);
    expect(long.textContent).toContain(words.gate.waited('2 h 5 min'));
    expect(long.closest('li')!.className).toContain('amber');
    const short = gateCard.getByRole('link', { name: /DC-000013/ });
    expect(short.closest('li')!.className).not.toContain('amber');
  });

  it('shows each card as soon as it loads, and an error only in its own card', async () => {
    dashboardApi();
    server.use(
      http.get('*/api/dashboard/leaks', () =>
        HttpResponse.json(
          { statusCode: 500, message: 'Database is restarting' },
          { status: 500 },
        ),
      ),
      http.get('*/api/dashboard/gate', async () => {
        await delay('infinite');
        return HttpResponse.json([]);
      }),
    );
    renderHome();

    expect(
      await card(words.leaks.title).findByText('Database is restarting'),
    ).toBeTruthy();
    expect(card(words.gate.title).getByText(text.loading)).toBeTruthy();
    expect(
      await card(words.todayCard.title).findByRole('link', {
        name: /Good pieces/,
      }),
    ).toBeTruthy();
    expect(
      await card(words.orders.title).findByRole('link', {
        name: /Open orders/,
      }),
    ).toBeTruthy();
  });

  it('is the home page of owners and managers only', async () => {
    const asked = dashboardApi();
    renderHome('SUPERVISOR');

    expect(
      await screen.findByText(text.home.welcome('Nasrin Akter')),
    ).toBeTruthy();
    expect(screen.queryByText(words.title)).toBeNull();
    expect(asked).toEqual([]);
  });
});

import { focusManager } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MachineOnBoard, Role } from '@/api/types';
import { text } from '@/i18n';
import {
  jobCard,
  machine,
  mould,
  page,
  product,
  productionEntry,
  rawMaterial,
  stockDocument,
  summary,
} from '@/test/fixtures';
import { floor, operator, productionLookups } from '@/test/production-lookups';
import { renderArea } from '@/test/render';
import { server } from '@/test/server';
import { ProductionArea } from './area';

const mount = '/production/*';
const words = text.production;
const card = jobCard();
const pp = rawMaterial();

/** The reads a job card page makes. */
function cardPage(entries = [productionEntry()]) {
  return [
    ...productionLookups(),
    http.get(`*/api/job-cards/${card.id}`, () => HttpResponse.json(card)),
    http.get(`*/api/job-cards/${card.id}/summary`, () =>
      HttpResponse.json(summary()),
    ),
    http.get(`*/api/job-cards/${card.id}/entries`, () =>
      HttpResponse.json(entries),
    ),
    http.get(`*/api/job-cards/${card.id}/waste`, () => HttpResponse.json([])),
    http.get(`*/api/job-cards/${card.id}/issue-suggestion`, () =>
      HttpResponse.json([
        {
          rawMaterialId: pp.id,
          code: pp.code,
          name: pp.name,
          requiredGrams: 25_000,
          issuedGrams: 7_500,
          suggestedGrams: 17_500,
        },
      ]),
    ),
    http.get('*/api/stock/documents', () =>
      HttpResponse.json(
        page([stockDocument({ number: 'ISS-000001', kind: 'ISSUE' })]),
      ),
    ),
  ];
}

describe('job cards', () => {
  it('lists job cards and filters them by machine', async () => {
    const asked: URLSearchParams[] = [];
    server.use(
      ...productionLookups(),
      http.get('*/api/job-cards', ({ request }) => {
        asked.push(new URL(request.url).searchParams);
        return HttpResponse.json(page([card]));
      }),
    );
    const { user } = renderArea(<ProductionArea />, {
      mount,
      at: '/production',
    });

    expect(await screen.findByRole('link', { name: 'JC-000001' })).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText(words.machine),
      machine().id,
    );
    await waitFor(() =>
      expect(asked.at(-1)?.get('machineId')).toBe(machine().id),
    );
  });

  it('offers only the moulds of the chosen product and estimates the run time', async () => {
    const asked: URLSearchParams[] = [];
    const bodies: unknown[] = [];
    // A later server.use goes first, so these win over the page's lookups.
    server.use(...cardPage());
    server.use(
      http.get('*/api/moulds', ({ request }) => {
        const query = new URL(request.url).searchParams;
        asked.push(query);
        return HttpResponse.json(page(query.get('productId') ? [mould()] : []));
      }),
      http.get('*/api/sales-orders', () => HttpResponse.json(page([]))),
      http.post('*/api/job-cards', async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(card, { status: 201 });
      }),
    );
    const { user } = renderArea(<ProductionArea />, {
      mount,
      at: '/production/new',
    });

    const mouldSelect = await screen.findByLabelText(words.mould);
    expect(mouldSelect).toHaveProperty('disabled', true);
    await user.selectOptions(
      screen.getByLabelText(words.product),
      product().id,
    );
    await user.selectOptions(
      mouldSelect,
      await within(mouldSelect).findByRole('option', { name: /M-CAP28-24/ }),
    );
    expect(asked.at(-1)?.get('productId')).toBe(product().id);
    expect(asked.at(-1)?.get('status')).toBe('ACTIVE');
    await user.selectOptions(
      screen.getByLabelText(words.machine),
      machine().id,
    );
    await user.type(screen.getByLabelText(words.plannedPieces), '10000');

    // 10,000 caps in 24 cavities: 417 shots of 8.5 s = 59 min 4.5 s.
    expect(screen.getByTestId('run-time').textContent).toBe(
      'About 1 h 0 min on the machine',
    );
    await user.click(screen.getByRole('button', { name: words.create }));

    expect(
      await screen.findByRole('heading', { name: /JC-000001/ }),
    ).toBeTruthy();
    expect(bodies[0]).toMatchObject({
      productId: product().id,
      mouldId: mould().id,
      machineId: machine().id,
      // The only production floor is chosen already.
      floorLocationId: floor.id,
      plannedPieces: 10_000,
      salesOrderId: null,
    });
  });
});

describe('job card page', () => {
  it('shows where every gram went, the unexplained difference in red', async () => {
    server.use(...cardPage());
    renderArea(<ProductionArea />, { mount, at: `/production/${card.id}` });

    expect(await screen.findByText('3.85%')).toBeTruthy();
    expect(screen.getByText('600 pcs')).toBeTruthy();
    expect(screen.getByText('1.225 kg')).toBeTruthy();
    expect(screen.getByText('13.717 kg').className).toContain(
      'text-destructive',
    );
    expect(screen.getByRole('link', { name: 'ISS-000001' })).toBeTruthy();
  });

  it.each([
    [
      'MANAGER',
      [words.actions.stop, words.actions.close],
      [words.cardTabs.material, words.cardTabs.goods],
    ],
    ['SUPERVISOR', [words.actions.stop], [words.cardTabs.material]],
    ['STOREKEEPER', [], [words.cardTabs.material, words.cardTabs.goods]],
    ['OPERATOR', [], []],
  ] as [Role, string[], string[]][])(
    'gives a %s only the buttons and tabs it can use',
    async (role, actions, extraTabs) => {
      server.use(...cardPage());
      renderArea(<ProductionArea />, {
        mount,
        at: `/production/${card.id}`,
        role,
      });

      expect(
        await screen.findByRole('heading', { name: /JC-000001/ }),
      ).toBeTruthy();
      const shown = Object.values(words.actions).filter(
        (label) => screen.queryByRole('button', { name: label }) !== null,
      );
      expect(shown).toEqual(actions);
      for (const tab of [words.cardTabs.material, words.cardTabs.goods]) {
        expect(screen.queryByRole('button', { name: tab }) !== null).toBe(
          extraTabs.includes(tab),
        );
      }
    },
  );

  it('shows shift warnings in amber and records the next shift from the last counter', async () => {
    const bodies: unknown[] = [];
    server.use(
      ...cardPage([
        productionEntry({
          warnings: [
            'Good + rejected is 1040 pieces, but shots x cavities is 6240',
          ],
        }),
      ]),
      http.post(`*/api/job-cards/${card.id}/entries`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(
          {
            ...productionEntry(),
            warnings: [
              'Shot counter starts at 260, but the previous entry on this machine ended at 250',
            ],
          },
          { status: 201 },
        );
      }),
    );
    const { user } = renderArea(<ProductionArea />, {
      mount,
      at: `/production/${card.id}?tab=shifts`,
      role: 'SUPERVISOR',
    });

    const listed = await screen.findByText(
      'Good + rejected is 1040 pieces, but shots x cavities is 6240',
    );
    expect(listed.closest('ul')!.className).toContain('amber');
    // The waste form below has its own shift and date fields.
    const form = within(
      screen.getByRole('heading', { name: words.record }).closest('section')!,
    );
    expect(form.getByLabelText<HTMLInputElement>(words.shotStart).value).toBe(
      '260',
    );
    await user.selectOptions(form.getByLabelText(words.operator), operator.id);
    await user.selectOptions(form.getByLabelText(words.shift), 'B');
    await user.type(form.getByLabelText(words.shotEnd), '302');
    await user.type(form.getByLabelText(words.good), '1000');
    await user.click(form.getByRole('button', { name: words.record }));

    const warning = await screen.findByText(
      'Shot counter starts at 260, but the previous entry on this machine ended at 250',
    );
    expect(warning.closest('ul')!.className).toContain('amber');
    expect(bodies[0]).toMatchObject({
      shift: 'B',
      operatorId: operator.id,
      shotStart: 260,
      shotEnd: 302,
      goodPieces: 1_000,
      rejectedPieces: 0,
    });
  });

  it('lets an operator record only as themselves', async () => {
    const bodies: { operatorId: string }[] = [];
    server.use(
      ...cardPage(),
      http.post(`*/api/job-cards/${card.id}/entries`, async ({ request }) => {
        bodies.push((await request.json()) as { operatorId: string });
        return HttpResponse.json(productionEntry(), { status: 201 });
      }),
    );
    const { user } = renderArea(<ProductionArea />, {
      mount,
      at: `/production/${card.id}?tab=shifts`,
      role: 'OPERATOR',
    });

    const form = within(
      (await screen.findByRole('heading', { name: words.record })).closest(
        'section',
      )!,
    );
    expect(form.getByLabelText<HTMLInputElement>(words.operator).readOnly).toBe(
      true,
    );
    expect(screen.queryByText(words.entries)).toBeNull();
    await user.type(form.getByLabelText(words.shotStart), '0');
    await user.type(form.getByLabelText(words.shotEnd), '10');
    await user.type(form.getByLabelText(words.good), '240');
    await user.click(form.getByRole('button', { name: words.record }));

    expect(await screen.findByText(words.recorded)).toBeTruthy();
    expect(bodies[0].operatorId).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('issues what the suggestion says is still needed', async () => {
    const bodies: unknown[] = [];
    server.use(
      ...cardPage(),
      http.post(`*/api/job-cards/${card.id}/issues`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(
          stockDocument({ number: 'ISS-000002', kind: 'ISSUE' }),
          {
            status: 201,
          },
        );
      }),
    );
    const { user } = renderArea(<ProductionArea />, {
      mount,
      at: `/production/${card.id}?tab=material`,
      role: 'STOREKEEPER',
    });

    const issueForm = (
      await screen.findByRole('heading', { name: words.issue })
    ).closest('section')!;
    expect(
      within(issueForm).getByLabelText<HTMLInputElement>(`${pp.code} (kg)`)
        .value,
    ).toBe('17.5');
    await user.click(
      within(issueForm).getByRole('button', { name: words.issueSubmit }),
    );

    expect(
      await screen.findByRole('link', { name: 'ISS-000002' }),
    ).toBeTruthy();
    expect(bodies[0]).toEqual({
      fromLocationId: '00000000-0000-4000-8000-000000000101',
      lines: [{ rawMaterialId: pp.id, kilograms: '17.5' }],
    });
  });

  it('hands good pieces over to finished goods', async () => {
    const bodies: unknown[] = [];
    server.use(...cardPage());
    server.use(
      http.get('*/api/locations', () =>
        HttpResponse.json(
          page([
            {
              ...floor,
              id: '00000000-0000-4000-8000-000000000103',
              code: 'FG-STORE',
              name: 'Finished goods store',
              kind: 'FINISHED_GOODS_STORE',
            },
          ]),
        ),
      ),
      http.post(`*/api/job-cards/${card.id}/handovers`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json(
          stockDocument({ number: 'FGH-000001', kind: 'HANDOVER' }),
          {
            status: 201,
          },
        );
      }),
    );
    const { user } = renderArea(<ProductionArea />, {
      mount,
      at: `/production/${card.id}?tab=goods`,
      role: 'STOREKEEPER',
    });

    expect(await screen.findByText('600 pcs on the floor')).toBeTruthy();
    await user.type(await screen.findByLabelText(text.orders.pieces), '600');
    await user.click(
      screen.getByRole('button', { name: words.handoverSubmit }),
    );

    expect(
      await screen.findByRole('link', { name: 'FGH-000001' }),
    ).toBeTruthy();
    expect(bodies[0]).toEqual({
      toLocationId: '00000000-0000-4000-8000-000000000103',
      pieces: 600,
    });
  });
});

describe('machine board', () => {
  afterEach(() => {
    focusManager.setFocused(undefined);
    vi.useRealTimers();
  });

  const board: MachineOnBoard[] = [
    {
      machineId: machine().id,
      code: 'IM-01',
      name: 'Haitian MA1600',
      state: 'RUNNING',
      jobCard: {
        id: card.id,
        number: 'JC-000001',
        productId: product().id,
        productCode: 'CAP-28',
      },
      goodPiecesToday: 1_000,
      rejectedPiecesToday: 40,
      rejectBasisPointsToday: 385,
    },
    {
      machineId: '00000000-0000-4000-8000-0000000000d2',
      code: 'IM-02',
      name: 'Haitian MA2500',
      state: 'IDLE',
      jobCard: null,
      goodPiecesToday: 0,
      rejectedPiecesToday: 0,
      rejectBasisPointsToday: null,
    },
    {
      machineId: '00000000-0000-4000-8000-0000000000d3',
      code: 'IM-03',
      name: 'Chen Hsong JM450',
      state: 'REPAIR',
      jobCard: null,
      goodPiecesToday: 0,
      rejectedPiecesToday: 0,
      rejectBasisPointsToday: null,
    },
  ];

  it('colours each machine by state, in the order the API gives', async () => {
    server.use(
      http.get('*/api/production/machine-board', () =>
        HttpResponse.json(board),
      ),
    );
    renderArea(<ProductionArea />, { mount, at: '/production/board' });

    const cards = await screen.findAllByRole('article');
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      'IM-01',
      'IM-02',
      'IM-03',
    ]);
    expect(cards[0].className).toContain('border-green-600');
    expect(cards[1].className).toContain('bg-muted');
    expect(cards[2].className).toContain('border-amber-500');
    expect(
      within(cards[0]).getByRole('link', { name: 'JC-000001' }),
    ).toBeTruthy();
    expect(
      within(cards[0]).getByText(/1,000 pcs good, 3.85% rejected/),
    ).toBeTruthy();
    expect(within(cards[1]).getByText(words.board.nothingToday)).toBeTruthy();
  });

  it('refreshes every minute, but not while the tab is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let reads = 0;
    server.use(
      http.get('*/api/production/machine-board', () => {
        reads += 1;
        return HttpResponse.json(board);
      }),
    );
    renderArea(<ProductionArea />, { mount, at: '/production/board' });
    await screen.findAllByRole('article');
    expect(reads).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(reads).toBe(2);

    focusManager.setFocused(false);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(reads).toBe(2);
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router';
import type { Device, PinHolder, Rejection, Role } from '@/api/types';
import { text } from '@/i18n';
import { formatMoment } from '@/lib/format';
import { ProductionArea } from '@/production/area';
import {
  jobCard,
  location,
  page,
  stockDocument,
  summary,
} from '@/test/fixtures';
import {
  floor,
  operator,
  productionLookups,
  regrind,
} from '@/test/production-lookups';
import { renderArea } from '@/test/render';
import { server } from '@/test/server';
import { scrapYard } from '@/test/stock-lookups';
import { TabletsArea } from './area';

const words = text.tablets;
const card = jobCard();

const device = (fields: Partial<Device> = {}): Device => ({
  id: '00000000-0000-4000-8000-000000000b01',
  name: 'Hall A tablet',
  floorLocationId: floor.id,
  status: 'PAIRED',
  pairingExpiresAt: null,
  pairedAt: '2026-10-15T03:00:00.000Z',
  lastSeenAt: '2026-10-15T08:00:00.000Z',
  revokedAt: null,
  createdAt: '2026-10-15T02:50:00.000Z',
  ...fields,
});

const holder = (fields: Partial<PinHolder> = {}): PinHolder => ({
  id: operator.id,
  name: operator.name,
  role: 'OPERATOR',
  email: null,
  phone: '+8801811000202',
  hasPin: true,
  lockedUntil: null,
  ...fields,
});

const refused = (fields: Partial<Rejection> = {}): Rejection => ({
  id: '00000000-0000-4000-8000-000000000c01',
  kind: 'PRODUCTION_ENTRY',
  status: 'REJECTED',
  reason: 'Not enough stock for RM-PP-01',
  deviceId: device().id,
  deviceName: 'Hall A tablet',
  recordedByName: operator.name,
  jobCardId: card.id,
  jobCardNumber: card.number,
  payload: {
    id: '00000000-0000-4000-8000-000000000c01',
    shift_date: '2026-10-15',
    shift: 'B',
    operator_id: operator.id,
    shot_start: 260,
    shot_end: 520,
    good_pieces: 1_000,
    rejected_pieces: 40,
  },
  deviceRecordedAt: '2026-10-15T08:00:00.000Z',
  receivedAt: '2026-10-15T09:00:00.000Z',
  reviewedByName: null,
  reviewedAt: null,
  reviewNote: null,
  ...fields,
});

/** The tablets area, and the job card page that "Record in office" opens. */
function renderTablets(at: string, role: Role) {
  return renderArea(
    <Routes>
      <Route path="/tablets/*" element={<TabletsArea />} />
      <Route path="/production/*" element={<ProductionArea />} />
    </Routes>,
    { mount: '/*', at, role },
  );
}

/** The reads of the job card page "Record in office" opens. */
function jobCardPage(rejection: Rejection) {
  // Within one server.use the first match wins: this list has a scrap yard.
  return [
    http.get('*/api/locations', () =>
      HttpResponse.json(page([location(), floor, scrapYard])),
    ),
    ...productionLookups(),
    http.get('*/api/sync/rejections', () =>
      HttpResponse.json(page([rejection])),
    ),
    http.get(`*/api/job-cards/${card.id}`, () =>
      HttpResponse.json({ ...card, salesOrderNumber: null }),
    ),
    http.get(`*/api/job-cards/${card.id}/summary`, () =>
      HttpResponse.json(summary()),
    ),
    http.get(`*/api/job-cards/${card.id}/entries`, () => HttpResponse.json([])),
    http.get(`*/api/job-cards/${card.id}/waste`, () => HttpResponse.json([])),
    http.get('*/api/stock/documents', () =>
      HttpResponse.json(page([stockDocument()])),
    ),
  ];
}

/** Answers a write with `answer`, keeping each body it got. */
function writes(method: 'post' | 'put', path: string, answer?: object) {
  const bodies: unknown[] = [];
  server.use(
    http[method](path, async ({ request }) => {
      bodies.push(await request.json());
      return answer
        ? HttpResponse.json(answer)
        : new HttpResponse(null, { status: 204 });
    }),
  );
  return bodies;
}

describe('devices', () => {
  it('registers a tablet and shows its pairing code once', async () => {
    const issued = device({
      status: 'PAIRING',
      pairedAt: null,
      lastSeenAt: null,
      pairingExpiresAt: '2026-10-15T09:30:00.000Z',
    });
    server.use(
      http.get('*/api/locations', () =>
        HttpResponse.json(page([location(), floor])),
      ),
      http.get('*/api/devices', () => HttpResponse.json([])),
    );
    const bodies = writes('post', '*/api/devices', {
      device: issued,
      pairingCode: 'ABCD2345',
    });
    const { user } = renderTablets('/tablets/devices', 'OWNER');

    await user.type(
      await screen.findByLabelText(words.devices.name),
      'Hall A tablet',
    );
    await user.click(
      screen.getByRole('button', { name: words.devices.register }),
    );

    expect(await screen.findByText('ABCD-2345')).toBeTruthy();
    expect(
      screen.getByText(
        words.devices.codeHint(formatMoment('2026-10-15T09:30:00.000Z')),
      ),
    ).toBeTruthy();
    // The only production floor is chosen already.
    expect(bodies).toEqual([
      { name: 'Hall A tablet', floorLocationId: floor.id },
    ]);
  });

  it('revokes a tablet after asking', async () => {
    server.use(
      http.get('*/api/locations', () => HttpResponse.json(page([floor]))),
      http.get('*/api/devices', () => HttpResponse.json([device()])),
    );
    const revoked: string[] = [];
    server.use(
      http.post('*/api/devices/:id/revoke', ({ params }) => {
        revoked.push(String(params.id));
        return HttpResponse.json(device({ status: 'REVOKED' }));
      }),
    );
    const { user } = renderTablets('/tablets/devices', 'OWNER');

    const row = (await screen.findByText('Hall A tablet')).closest('tr')!;
    expect(within(row).getByText(words.devices.statuses.PAIRED)).toBeTruthy();
    expect(within(row).getByText(floor.code)).toBeTruthy();
    await user.click(
      within(row).getByRole('button', { name: words.devices.revoke }),
    );
    expect(
      screen.getByText(words.devices.confirmRevoke('Hall A tablet')),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: text.confirm.yes }));

    await waitFor(() => expect(revoked).toEqual([device().id]));
  });
});

describe('PINs', () => {
  it('refuses a trivial PIN before sending, and sets a good one', async () => {
    const lockedUntil = '2026-10-15T08:15:00.000Z';
    server.use(
      http.get('*/api/users/pins', () =>
        HttpResponse.json([holder({ lockedUntil })]),
      ),
    );
    const bodies = writes('put', `*/api/users/${operator.id}/pin`);
    const { user } = renderTablets('/tablets', 'MANAGER');

    const locked = await screen.findByText(
      words.pins.lockedUntil(formatMoment(lockedUntil)),
    );
    expect(locked.className).toContain('amber');
    await user.click(screen.getByRole('button', { name: words.pins.setPin }));
    const pin = screen.getByLabelText(words.pins.newPin);
    await user.type(pin, '1234');
    await user.click(screen.getByRole('button', { name: text.confirm.yes }));
    expect(await screen.findByText(words.pins.trivial)).toBeTruthy();
    expect(bodies).toEqual([]);

    await user.clear(pin);
    await user.type(pin, '2580');
    await user.click(screen.getByRole('button', { name: text.confirm.yes }));

    await waitFor(() => expect(bodies).toEqual([{ pin: '2580' }]));
  });

  it.each<[Role, string[]]>([
    ['OWNER', [words.tabs.devices, words.tabs.pins, words.tabs.rejections]],
    ['MANAGER', [words.tabs.pins, words.tabs.rejections]],
    ['SUPERVISOR', [words.tabs.rejections]],
  ])('shows a %s only its own tabs', async (role, tabs) => {
    server.use(
      http.get('*/api/locations', () => HttpResponse.json(page([floor]))),
      http.get('*/api/devices', () => HttpResponse.json([])),
      http.get('*/api/users/pins', () => HttpResponse.json([])),
      http.get('*/api/sync/rejections', () => HttpResponse.json(page([]))),
    );
    renderTablets('/tablets', role);

    const nav = await screen.findByRole('navigation');
    await waitFor(() =>
      expect(
        within(nav)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(tabs),
    );
  });
});

describe('sync rejections', () => {
  it('lists the records waiting for review, with what they say and why they were refused', async () => {
    const asked: URLSearchParams[] = [];
    server.use(
      http.get('*/api/sync/rejections', ({ request }) => {
        asked.push(new URL(request.url).searchParams);
        return HttpResponse.json(page([refused()]));
      }),
    );
    renderTablets('/tablets', 'SUPERVISOR');

    const row = (
      await screen.findByText('Not enough stock for RM-PP-01')
    ).closest('tr')!;
    expect(asked[0].get('status')).toBe('REJECTED');
    expect(
      within(row).getByText(
        words.rejections.production('B', '15 Oct 2026', '1,000', '40'),
      ),
    ).toBeTruthy();
    expect(
      within(row).getByRole('link', { name: card.number }).getAttribute('href'),
    ).toBe(`/production/${card.id}`);
    expect(within(row).getByText(operator.name)).toBeTruthy();
  });

  it('opens the office shift form filled in from a refused record', async () => {
    server.use(...jobCardPage(refused()));
    const { user } = renderTablets('/tablets/rejections', 'SUPERVISOR');

    await user.click(
      await screen.findByRole('link', {
        name: words.rejections.recordInOffice,
      }),
    );

    expect(await screen.findByText(words.prefilled)).toBeTruthy();
    const form = within(
      screen
        .getByRole('heading', { name: text.production.record })
        .closest('section')!,
    );
    const value = (label: string) =>
      form.getByLabelText<HTMLInputElement | HTMLSelectElement>(label).value;
    await waitFor(() =>
      expect(value(text.production.operator)).toBe(operator.id),
    );
    expect(value(text.production.shift)).toBe('B');
    expect(value(text.production.shiftDate)).toBe('2026-10-15');
    expect(value(text.production.shotStart)).toBe('260');
    expect(value(text.production.shotEnd)).toBe('520');
    expect(value(text.production.good)).toBe('1000');
    expect(value(text.production.rejected)).toBe('40');
  });

  it('opens the office waste form filled in from a refused waste record', async () => {
    server.use(
      ...jobCardPage(
        refused({
          kind: 'WASTE_ENTRY',
          payload: {
            shift_date: '2026-10-15',
            shift: 'C',
            waste_material_id: regrind.id,
            scrap_location_id: scrapYard.id,
            runner_grams: 500,
            reject_grams: 0,
            purge_grams: 1_250,
            sweepings_grams: 0,
          },
        }),
      ),
    );
    const { user } = renderTablets('/tablets/rejections', 'SUPERVISOR');

    await user.click(
      await screen.findByRole('link', {
        name: words.rejections.recordInOffice,
      }),
    );

    const form = within(
      (
        await screen.findByRole('heading', {
          name: text.production.recordWaste,
        })
      ).closest('section')!,
    );
    const value = (label: string) =>
      form.getByLabelText<HTMLInputElement | HTMLSelectElement>(label).value;
    const kinds = text.production.wasteTypes;
    expect(value(kinds.RUNNER)).toBe('0.5');
    expect(value(kinds.REJECT)).toBe('');
    expect(value(kinds.PURGE)).toBe('1.25');
    expect(value(text.production.wasteMaterial)).toBe(regrind.id);
    expect(value(text.production.scrapYard)).toBe(scrapYard.id);
    expect(value(text.production.shift)).toBe('C');
  });

  it('resolves a refused record with a note', async () => {
    server.use(
      http.get('*/api/sync/rejections', () =>
        HttpResponse.json(page([refused()])),
      ),
    );
    const bodies = writes(
      'post',
      `*/api/sync/rejections/${refused().id}/resolve`,
    );
    const { user } = renderTablets('/tablets', 'SUPERVISOR');

    await user.click(
      await screen.findByRole('button', { name: words.rejections.resolve }),
    );
    await user.type(
      screen.getByLabelText(words.rejections.note),
      'Recorded in the office',
    );
    await user.click(screen.getByRole('button', { name: text.confirm.yes }));

    await waitFor(() =>
      expect(bodies).toEqual([{ note: 'Recorded in the office' }]),
    );
  });
});

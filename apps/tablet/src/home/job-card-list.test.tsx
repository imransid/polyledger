import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import { synchronize } from '../sync/engine';
import { testDatabase } from '../test/database';
import { fakeApi, pulled } from '../test/fake-api';
import { jobCard, machine, product } from '../test/floor';
import { renderWithApp } from '../test/render';
import { JobCardList } from './job-card-list';

describe('job card list', () => {
  it('shows the floor’s job cards from the tablet alone, offline', async () => {
    const db = await testDatabase();
    const server = fakeApi({
      'GET /sync/pull': () => ({
        body: pulled(1_000, {
          job_cards: { created: [jobCard] },
          machines: { created: [machine] },
          products: { created: [product] },
        }),
      }),
    });
    await synchronize(db, server.api);
    const offline = fakeApi({});

    await renderWithApp(<JobCardList />, { db, api: offline.api }, 'bn');

    expect(await screen.findByText('IM-01')).toBeTruthy();
    screen.getByText('চলছে');
    screen.getByText('Bottle cap 28 mm (CAP-28)');
    screen.getByText('JC-2026-0001');
    screen.getByText('লক্ষ্য: 1,20,000 পিস');
    expect(offline.calls).toEqual([]);
  });

  it('says so when the floor has none', async () => {
    const db = await testDatabase();

    await renderWithApp(<JobCardList />, { db, api: fakeApi({}).api });

    expect(
      await screen.findByText('No job cards on this floor right now.'),
    ).toBeTruthy();
  });
});

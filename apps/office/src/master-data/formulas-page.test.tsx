import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { text } from '@/i18n';
import { formulaVersion, page, product, rawMaterial } from '@/test/fixtures';
import { renderArea } from '@/test/render';
import { server } from '@/test/server';
import { MasterDataArea } from './area';

const words = text.formulas;

describe('formulas', () => {
  it('activates a version only after confirming it', async () => {
    const cap = product();
    const first = formulaVersion();
    let second = formulaVersion({
      id: '00000000-0000-4000-8000-0000000000f2',
      version: 2,
      isActive: false,
      wasteBasisPoints: 250,
    });
    const activated: string[] = [];
    server.use(
      http.get(`*/api/products/${cap.id}`, () => HttpResponse.json(cap)),
      http.get('*/api/raw-materials', () =>
        HttpResponse.json(page([rawMaterial()])),
      ),
      http.get(`*/api/products/${cap.id}/formulas`, () =>
        HttpResponse.json([second, first]),
      ),
      http.post(`*/api/formulas/${second.id}/activate`, ({ request }) => {
        activated.push(request.headers.get('Idempotency-Key') ?? '');
        second = { ...second, isActive: true };
        return HttpResponse.json(second);
      }),
    );
    const { user } = renderArea(<MasterDataArea />, {
      mount: '/master-data/*',
      at: `/master-data/products/${cap.id}/formulas`,
    });

    expect(await screen.findByText(words.title('CAP-28'))).toBeTruthy();
    // Only the inactive version offers Activate.
    await user.click(screen.getByRole('button', { name: words.activate }));
    const dialog = await screen.findByRole('alertdialog');
    expect(
      within(dialog).getByText(
        'Activate version 2 for CAP-28? New job cards will use it.',
      ),
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole('button', { name: text.confirm.cancel }),
    );
    expect(activated).toEqual([]);

    await user.click(screen.getByRole('button', { name: words.activate }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: text.confirm.yes,
      }),
    );

    expect(await screen.findAllByText(words.activeBadge)).toHaveLength(2);
    expect(activated).toHaveLength(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { text } from '@/i18n';
import { machine, mould, page, product } from '@/test/fixtures';
import { renderArea } from '@/test/render';
import { server } from '@/test/server';
import { MasterDataArea } from './area';

const mount = '/master-data/*';
const words = text.masterData;

/** Answers a POST or PATCH with `answer` and keeps what was sent. */
function capture(method: 'post' | 'patch', path: string, answer: object) {
  const bodies: unknown[] = [];
  server.use(
    http[method](path, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json(answer, {
        status: method === 'post' ? 201 : 200,
      });
    }),
  );
  return bodies;
}

describe('products', () => {
  it('takes the piece weight in grams and sends milligrams', async () => {
    const created = product();
    const bodies = capture('post', '*/api/products', created);
    server.use(
      http.get(`*/api/products/${created.id}`, () =>
        HttpResponse.json(created),
      ),
    );
    const { user } = renderArea(<MasterDataArea />, {
      mount,
      at: '/master-data/products/new',
    });

    await user.type(screen.getByLabelText(words.code), 'CAP-28');
    await user.type(screen.getByLabelText(words.name), '28 mm bottle cap');
    await user.type(screen.getByLabelText(words.products.pieceWeight), '2.5');
    await user.type(screen.getByLabelText(words.products.colour), 'White');
    await user.type(
      screen.getByLabelText(words.products.piecesPerCarton),
      '2000',
    );
    await user.click(screen.getByRole('button', { name: text.record.save }));

    expect(
      await screen.findByRole('link', { name: words.products.formulas }),
    ).toBeTruthy();
    expect(bodies).toEqual([
      {
        code: 'CAP-28',
        name: '28 mm bottle cap',
        pieceWeightMg: 2_500,
        colour: 'White',
        piecesPerCarton: 2_000,
      },
    ]);
    expect(
      screen.getByLabelText<HTMLInputElement>(words.products.pieceWeight).value,
    ).toBe('2.5');
  });
});

describe('moulds', () => {
  it('takes seconds and grams, and links the mould to a product', async () => {
    const cap = product();
    const created = mould();
    const bodies = capture('post', '*/api/moulds', created);
    server.use(
      http.get('*/api/products', () => HttpResponse.json(page([cap]))),
      http.get(`*/api/moulds/${created.id}`, () => HttpResponse.json(created)),
    );
    const { user } = renderArea(<MasterDataArea />, {
      mount,
      at: '/master-data/moulds/new',
    });

    await user.type(screen.getByLabelText(words.code), 'M-CAP28-24');
    await user.type(
      screen.getByLabelText(words.name),
      '28 mm cap, 24 cavities',
    );
    await user.selectOptions(
      await screen.findByRole('combobox', { name: words.moulds.product }),
      await screen.findByRole('option', { name: 'CAP-28 · 28 mm bottle cap' }),
    );
    await user.type(screen.getByLabelText(words.moulds.cavities), '24');
    await user.type(screen.getByLabelText(words.moulds.cycleTime), '8.5');
    await user.clear(screen.getByLabelText(words.moulds.runnerWeight));
    await user.type(screen.getByLabelText(words.moulds.runnerWeight), '18');
    await user.click(screen.getByRole('button', { name: text.record.save }));

    expect(
      await screen.findByRole('heading', {
        name: 'M-CAP28-24 · 28 mm cap, 24 cavities',
      }),
    ).toBeTruthy();
    expect(bodies).toEqual([
      {
        code: 'M-CAP28-24',
        name: '28 mm cap, 24 cavities',
        productId: cap.id,
        cavities: 24,
        cycleTimeTenths: 85,
        runnerWeightMg: 18_000,
      },
    ]);
  });
});

describe('machines', () => {
  it('sends a machine to repair', async () => {
    const press = machine();
    const bodies = capture('patch', `*/api/machines/${press.id}`, {
      ...press,
      status: 'REPAIR',
    });
    server.use(
      http.get('*/api/machines', () => HttpResponse.json(page([press]))),
      http.get(`*/api/machines/${press.id}`, () => HttpResponse.json(press)),
    );
    const { user } = renderArea(<MasterDataArea />, {
      mount,
      at: '/master-data/machines',
    });

    await user.click(await screen.findByRole('link', { name: 'IM-01' }));
    await user.selectOptions(
      await screen.findByRole('combobox', { name: words.status }),
      words.statuses.REPAIR,
    );
    await user.click(screen.getByRole('button', { name: text.record.save }));

    expect(await screen.findByText(text.record.saved)).toBeTruthy();
    expect(bodies).toEqual([
      { name: 'Haitian MA1600', tonnage: 160, status: 'REPAIR' },
    ]);
  });
});

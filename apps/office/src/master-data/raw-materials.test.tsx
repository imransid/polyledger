import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { text } from '@/i18n';
import { page, rawMaterial } from '@/test/fixtures';
import { renderArea } from '@/test/render';
import { server } from '@/test/server';
import { MasterDataArea } from './area';

const mount = '/master-data/*';
const words = text.masterData.rawMaterials;

describe('raw materials', () => {
  it('creates the first one from the empty list, once however often Save is clicked', async () => {
    const created = rawMaterial();
    const posts: { body: unknown; key: string | null }[] = [];
    server.use(
      http.get('*/api/raw-materials', () => HttpResponse.json(page([]))),
      http.post('*/api/raw-materials', async ({ request }) => {
        posts.push({
          body: await request.json(),
          key: request.headers.get('Idempotency-Key'),
        });
        return HttpResponse.json(created, { status: 201 });
      }),
      http.get(`*/api/raw-materials/${created.id}`, () =>
        HttpResponse.json(created),
      ),
    );
    const { user } = renderArea(<MasterDataArea />, {
      mount,
      at: '/master-data/raw-materials',
    });

    expect(await screen.findByText(text.list.empty)).toBeTruthy();
    await user.click(screen.getByRole('link', { name: text.list.create }));
    await user.type(
      await screen.findByLabelText(text.masterData.code),
      'RM-PP-01',
    );
    await user.type(
      screen.getByLabelText(text.masterData.name),
      'PP homopolymer',
    );
    await user.type(screen.getByLabelText(words.minimumStock), '500');
    await user.dblClick(screen.getByRole('button', { name: text.record.save }));

    expect(
      await screen.findByRole('heading', { name: 'RM-PP-01 · PP homopolymer' }),
    ).toBeTruthy();
    expect(posts[0].body).toEqual({
      code: 'RM-PP-01',
      name: 'PP homopolymer',
      type: 'RESIN',
      minimumStockGrams: 500_000,
    });
    // Every request of the double click carries the same key, so the API
    // records one material.
    expect(posts[0].key).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Set(posts.map((post) => post.key)).size).toBe(1);
    expect(
      screen.getByLabelText<HTMLInputElement>(text.masterData.code).readOnly,
    ).toBe(true);
  });

  it('puts API errors next to their field, or at the top', async () => {
    let answer = HttpResponse.json(
      { statusCode: 400, message: ['minimumStockGrams: Too big'] },
      { status: 400 },
    );
    server.use(http.post('*/api/raw-materials', () => answer));
    const { user } = renderArea(<MasterDataArea />, {
      mount,
      at: '/master-data/raw-materials/new',
    });
    await user.type(screen.getByLabelText(text.masterData.code), 'RM-PP-01');
    await user.type(screen.getByLabelText(text.masterData.name), 'PP');
    await user.type(screen.getByLabelText(words.minimumStock), '9999999');

    await user.click(screen.getByRole('button', { name: text.record.save }));
    const field = screen.getByLabelText(words.minimumStock);
    expect(await screen.findByText('Too big')).toBeTruthy();
    expect(field.getAttribute('aria-invalid')).toBe('true');

    answer = HttpResponse.json(
      { statusCode: 409, message: 'Code RM-PP-01 is already in use' },
      { status: 409 },
    );
    await user.click(screen.getByRole('button', { name: text.record.save }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Code RM-PP-01 is already in use',
    );
  });

  it.each(['STOREKEEPER', 'SUPERVISOR'] as const)(
    'lets a %s look but not change anything',
    async (role) => {
      const material = rawMaterial();
      server.use(
        http.get('*/api/raw-materials', () =>
          HttpResponse.json(page([material])),
        ),
        http.get(`*/api/raw-materials/${material.id}`, () =>
          HttpResponse.json(material),
        ),
      );
      const { user } = renderArea(<MasterDataArea />, {
        mount,
        at: '/master-data/raw-materials',
        role,
      });

      await user.click(
        await screen.findByRole('link', { name: material.code }),
      );
      expect(await screen.findByText(text.record.readOnly)).toBeTruthy();

      expect(screen.queryByRole('link', { name: text.list.create })).toBeNull();
      expect(
        screen.queryByRole('button', { name: text.record.save }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: text.record.deactivate }),
      ).toBeNull();
      // Disabled through its fieldset.
      expect(
        screen.getByLabelText(text.masterData.name).matches(':disabled'),
      ).toBe(true);
    },
  );

  it('gives a manager Create, Save and Deactivate', async () => {
    const material = rawMaterial();
    server.use(
      http.get('*/api/raw-materials', () =>
        HttpResponse.json(page([material])),
      ),
      http.get(`*/api/raw-materials/${material.id}`, () =>
        HttpResponse.json(material),
      ),
    );
    const { user } = renderArea(<MasterDataArea />, {
      mount,
      at: '/master-data/raw-materials',
    });

    const row = await screen.findByRole('link', { name: material.code });
    expect(screen.getByRole('link', { name: text.list.create })).toBeTruthy();
    await user.click(row);
    expect(
      await screen.findByRole('button', { name: text.record.save }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: text.record.deactivate }),
    ).toBeTruthy();
  });
});

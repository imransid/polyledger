import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllLocations } from '@/api/lookups';
import type { JobCard, Location } from '@/api/types';
import { PostedNotice } from '@/components/document-link';
import { ErrorMessage } from '@/components/message';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { showApiError } from '@/lib/form-errors';
import { wholeNumber } from '@/lib/form-fields';
import { formatPieces } from '@/lib/format';
import { useWrite } from '@/lib/use-write';

const words = text.production;

const handoverForm = z.object({
  toLocationId: z.string().min(1, text.required),
  pieces: wholeNumber(),
});

/** Good pieces from the floor into a finished goods store. */
export function GoodsTab({ card }: { card: JobCard }) {
  const locations = useAllLocations();
  const summary = useQuery({
    queryKey: ['job-cards', 'summary', card.id],
    queryFn: () =>
      unwrap(
        api.GET('/job-cards/{id}/summary', {
          params: { path: { id: card.id } },
        }),
      ),
  });
  const inWork = card.status === 'RELEASED' || card.status === 'RUNNING';
  return (
    <section className="grid gap-3">
      <h2 className="font-semibold">{words.handover}</h2>
      {summary.data && (
        <p className="text-sm tabular-nums">
          {words.onFloor(formatPieces(summary.data.piecesOnFloor))}
        </p>
      )}
      {inWork && locations.data && (
        <HandoverForm
          card={card}
          stores={locations.data.filter(
            (location) =>
              location.isActive && location.kind === 'FINISHED_GOODS_STORE',
          )}
        />
      )}
    </section>
  );
}

function HandoverForm({ card, stores }: { card: JobCard; stores: Location[] }) {
  const write = useWrite('job-cards', 'stock');
  const [posted, setPosted] = useState<{ id: string; number: string }>();
  const form = useForm({
    resolver: zodResolver(handoverForm),
    defaultValues: {
      toLocationId: stores.length === 1 ? stores[0].id : '',
      pieces: '',
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ toLocationId, pieces }) => {
    try {
      const document = await unwrap(
        api.POST('/job-cards/{id}/handovers', {
          params: { path: { id: card.id } },
          body: { toLocationId, pieces },
          headers: write.headers,
        }),
      );
      setPosted(document);
      await write.done();
      form.reset({ toLocationId, pieces: '' });
    } catch (error) {
      showApiError(form, error, {
        toLocationId: 'toLocationId',
        pieces: 'pieces',
      });
    }
  });

  return (
    <>
      <PostedNotice document={posted} />
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit} noValidate>
        <SelectField
          label={words.toFinishedGoods}
          options={[
            { value: '', label: text.stock.chooseLocation },
            ...stores.map((store) => ({
              value: store.id,
              label: `${store.code} · ${store.name}`,
            })),
          ]}
          error={errors.toLocationId?.message}
          {...form.register('toLocationId')}
        />
        <TextField
          label={text.orders.pieces}
          inputMode="numeric"
          className="text-right tabular-nums"
          error={errors.pieces?.message}
          {...form.register('pieces')}
        />
        <ErrorMessage message={errors.root?.message} />
        <div className="sm:col-span-2">
          <Button type="submit" disabled={isSubmitting}>
            {words.handoverSubmit}
          </Button>
        </div>
      </form>
    </>
  );
}

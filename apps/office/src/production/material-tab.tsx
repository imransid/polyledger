import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllLocations } from '@/api/lookups';
import type { IssueSuggestionLine, JobCard, Location } from '@/api/types';
import { STORE_STAFF } from '@/auth/permissions';
import { useUser } from '@/auth/use-session';
import { DataTable } from '@/components/data-table';
import { PostedNotice } from '@/components/document-link';
import { ErrorMessage } from '@/components/message';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { formatDecimal, parseDecimal } from '@/lib/decimal';
import { showApiError } from '@/lib/form-errors';
import { formatWeight } from '@/lib/format';
import { useWrite } from '@/lib/use-write';

const words = text.production;

export function MaterialTab({ card }: { card: JobCard }) {
  const canStore = STORE_STAFF.includes(useUser().role);
  const inWork = card.status === 'RELEASED' || card.status === 'RUNNING';
  const locations = useAllLocations();
  const suggestion = useQuery({
    queryKey: ['job-cards', 'suggestion', card.id],
    queryFn: () =>
      unwrap(
        api.GET('/job-cards/{id}/issue-suggestion', {
          params: { path: { id: card.id } },
        }),
      ),
  });
  if (!suggestion.data || !locations.data) {
    return (
      <ErrorMessage
        message={suggestion.error?.message ?? locations.error?.message}
      />
    );
  }
  const stores = locations.data.filter(
    (location) => location.isActive && location.kind === 'RAW_MATERIAL_STORE',
  );
  return (
    <div className="grid gap-6">
      <section className="grid gap-2">
        <h2 className="font-semibold">{words.suggestion}</h2>
        <DataTable<IssueSuggestionLine>
          rows={suggestion.data}
          rowKey={(line) => line.rawMaterialId}
          columns={[
            {
              header: words.material,
              cell: (line) => `${line.code} · ${line.name}`,
            },
            {
              header: words.required,
              numeric: true,
              cell: (line) => formatWeight(line.requiredGrams),
            },
            {
              header: words.issuedSoFar,
              numeric: true,
              cell: (line) => formatWeight(line.issuedGrams),
            },
            {
              header: words.suggested,
              numeric: true,
              cell: (line) => formatWeight(line.suggestedGrams),
            },
          ]}
        />
      </section>
      {canStore && inWork && (
        <>
          <MaterialMove
            title={words.issue}
            submit={words.issueSubmit}
            storeLabel={words.fromStore}
            stores={stores}
            materials={suggestion.data}
            // What the plan still needs, ready to post or adjust.
            prefill={(line) =>
              line.suggestedGrams > 0
                ? formatDecimal(line.suggestedGrams, 3)
                : ''
            }
            post={(locationId, lines, headers) =>
              unwrap(
                api.POST('/job-cards/{id}/issues', {
                  params: { path: { id: card.id } },
                  body: { fromLocationId: locationId, lines },
                  headers,
                }),
              )
            }
          />
          <MaterialMove
            title={words.giveBack}
            submit={words.giveBackSubmit}
            storeLabel={words.toStore}
            stores={stores}
            materials={suggestion.data}
            prefill={() => ''}
            post={(locationId, lines, headers) =>
              unwrap(
                api.POST('/job-cards/{id}/returns', {
                  params: { path: { id: card.id } },
                  body: { toLocationId: locationId, lines },
                  headers,
                }),
              )
            }
          />
        </>
      )}
    </div>
  );
}

const moveForm = z.object({
  locationId: z.string().min(1, text.required),
  kilograms: z
    .array(
      z
        .string()
        .refine(
          (kg) => kg.trim() === '' || parseDecimal(kg, 3) !== null,
          text.valid.kilograms,
        ),
    )
    .refine(
      (kgs) => kgs.some((kg) => (parseDecimal(kg, 3) ?? 0) > 0),
      text.stock.noLines,
    ),
});

interface MaterialMoveProps {
  title: string;
  submit: string;
  storeLabel: string;
  stores: Location[];
  materials: IssueSuggestionLine[];
  prefill: (line: IssueSuggestionLine) => string;
  post: (
    locationId: string,
    lines: { rawMaterialId: string; kilograms: string }[],
    headers: Record<string, string>,
  ) => Promise<{ id: string; number: string }>;
}

/** One kg box per formula material; blank boxes are left out. */
function MaterialMove({
  title,
  submit,
  storeLabel,
  stores,
  materials,
  prefill,
  post,
}: MaterialMoveProps) {
  const write = useWrite('job-cards', 'stock');
  const [posted, setPosted] = useState<{ id: string; number: string }>();
  const defaults = {
    locationId: stores.length === 1 ? stores[0].id : '',
    kilograms: materials.map(prefill),
  };
  const form = useForm({
    resolver: zodResolver(moveForm),
    defaultValues: defaults,
  });
  const { errors, isSubmitting } = form.formState;

  const send = form.handleSubmit(async ({ locationId, kilograms }) => {
    try {
      const document = await post(
        locationId,
        materials
          .map((material, index) => ({
            rawMaterialId: material.rawMaterialId,
            kilograms: kilograms[index].trim(),
          }))
          .filter((line) => (parseDecimal(line.kilograms, 3) ?? 0) > 0),
        write.headers,
      );
      setPosted(document);
      await write.done();
      form.reset({ locationId, kilograms: materials.map(() => '') });
    } catch (error) {
      showApiError(form, error, {
        fromLocationId: 'locationId',
        toLocationId: 'locationId',
      });
    }
  });

  return (
    <section className="grid gap-3">
      <h2 className="font-semibold">{title}</h2>
      <PostedNotice document={posted} />
      <form className="grid gap-3" onSubmit={send} noValidate>
        <SelectField
          label={storeLabel}
          options={[
            { value: '', label: text.stock.chooseLocation },
            ...stores.map((store) => ({
              value: store.id,
              label: `${store.code} · ${store.name}`,
            })),
          ]}
          error={errors.locationId?.message}
          {...form.register('locationId')}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {materials.map((material, index) => (
            <TextField
              key={material.rawMaterialId}
              label={`${material.code} (${words.kilograms})`}
              inputMode="decimal"
              className="text-right tabular-nums"
              error={errors.kilograms?.[index]?.message}
              {...form.register(`kilograms.${index}`)}
            />
          ))}
        </div>
        <ErrorMessage
          message={errors.kilograms?.root?.message ?? errors.kilograms?.message}
        />
        <ErrorMessage message={errors.root?.message} />
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {submit}
          </Button>
        </div>
      </form>
    </section>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllLocations } from '@/api/lookups';
import type { Location } from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { SelectField } from '@/components/select-field';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { showApiError } from '@/lib/form-errors';
import {
  apiLine,
  emptyLine,
  locationOptions,
  parseItemValue,
  stockLines,
} from './lines';
import { PostedNotice } from '@/components/document-link';
import { ItemSelect, StockLineFields } from './parts';
import { useItems, usePosting } from './use-stock';

const words = text.stock.opening;

const openingForm = z.object({
  locationId: z.string().min(1, text.required),
  lines: stockLines,
});

// What was counted when the system started; the API allows one opening per
// item and location.
export function OpeningPage() {
  const locations = useAllLocations();
  const items = useItems();
  if (!locations.data || !items.ready) {
    return <RecordPending error={locations.error ?? items.error} />;
  }
  return (
    <OpeningForm
      locations={locations.data.filter((location) => location.isActive)}
    />
  );
}

function OpeningForm({ locations }: { locations: Location[] }) {
  const items = useItems();
  const posting = usePosting();
  const form = useForm({
    resolver: zodResolver(openingForm),
    defaultValues: { locationId: '', lines: [emptyLine] },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const watched = useWatch({ control: form.control, name: 'lines' });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ locationId, lines }) => {
    try {
      const document = await unwrap(
        api.POST('/stock/openings', {
          body: {
            locationId,
            lines: lines.map((line) =>
              apiLine(parseItemValue(line.item)!, line.quantity),
            ),
          },
          headers: posting.headers,
        }),
      );
      await posting.succeeded(document);
      form.reset({ locationId, lines: [emptyLine] });
    } catch (error) {
      showApiError(form, error, { locationId: 'locationId' });
    }
  });

  return (
    <RecordShell title={words.title}>
      <PostedNotice document={posting.posted} />
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <SelectField
          label={text.stock.location}
          options={locationOptions(locations)}
          error={errors.locationId?.message}
          {...form.register('locationId')}
        />
        {lines.fields.map((field, index) => (
          <StockLineFields
            key={field.id}
            item={
              <ItemSelect
                materials={items.materials.filter(
                  (material) => material.isActive,
                )}
                products={items.products.filter((product) => product.isActive)}
                error={errors.lines?.[index]?.item?.message}
                {...form.register(`lines.${index}.item`)}
              />
            }
            quantityLabel={words.counted}
            itemType={parseItemValue(watched?.[index]?.item ?? '')?.itemType}
            quantity={form.register(`lines.${index}.quantity`)}
            quantityError={errors.lines?.[index]?.quantity}
            onRemove={
              lines.fields.length > 1 ? () => lines.remove(index) : undefined
            }
          />
        ))}
        <ErrorMessage
          message={errors.lines?.root?.message ?? errors.lines?.message}
        />
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => lines.append(emptyLine)}
          >
            <Plus />
            {text.stock.addLine}
          </Button>
        </div>
        <ErrorMessage message={errors.root?.message} />
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {words.submit}
          </Button>
        </div>
      </form>
    </RecordShell>
  );
}

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
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { showApiError } from '@/lib/form-errors';
import { requiredText } from '@/lib/form-fields';
import { formatChange, formatQuantity } from '@/lib/format';
import {
  apiLine,
  emptyLine,
  locationOptions,
  parseAmount,
  parseItemValue,
  stockLines,
} from './lines';
import { PostedNotice } from '@/components/document-link';
import { ItemSelect, LineInfo, StockLineFields } from './parts';
import { useItems, useLocationBalances, usePosting } from './use-stock';

const words = text.stock.adjust;

const adjustmentForm = z.object({
  locationId: z.string().min(1, text.required),
  reason: requiredText(300),
  lines: stockLines,
});

export function AdjustmentPage() {
  const locations = useAllLocations();
  const items = useItems();
  if (!locations.data || !items.ready) {
    return <RecordPending error={locations.error ?? items.error} />;
  }
  return (
    <AdjustmentForm
      locations={locations.data.filter((location) => location.isActive)}
    />
  );
}

// The storekeeper types what they counted; the API books the difference.
// Showing that difference first catches a typo before it moves stock.
function AdjustmentForm({ locations }: { locations: Location[] }) {
  const items = useItems();
  const posting = usePosting();
  const form = useForm({
    resolver: zodResolver(adjustmentForm),
    defaultValues: { locationId: '', reason: '', lines: [emptyLine] },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const [locationId, watched] = useWatch({
    control: form.control,
    name: ['locationId', 'lines'],
  });
  const balances = useLocationBalances(locationId);
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ locationId, reason, lines }) => {
    try {
      const document = await unwrap(
        api.POST('/stock/adjustments', {
          body: {
            locationId,
            reason,
            lines: lines.map((line) =>
              apiLine(parseItemValue(line.item)!, line.quantity),
            ),
          },
          headers: posting.headers,
        }),
      );
      await posting.succeeded(document);
      form.reset({ locationId, reason: '', lines: [emptyLine] });
    } catch (error) {
      showApiError(form, error, { locationId: 'locationId', reason: 'reason' });
    }
  });

  return (
    <RecordShell title={words.title}>
      <PostedNotice document={posting.posted} />
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={text.stock.location}
            options={locationOptions(locations)}
            error={errors.locationId?.message}
            {...form.register('locationId')}
          />
          <TextField
            label={words.reason}
            error={errors.reason?.message}
            {...form.register('reason')}
          />
        </div>
        {lines.fields.map((field, index) => {
          const line = watched?.[index];
          const item = parseItemValue(line?.item ?? '');
          const current =
            item && balances.data
              ? (balances.data.get(line?.item ?? '') ?? 0)
              : null;
          const counted = item
            ? parseAmount(item.itemType, line?.quantity ?? '')
            : null;
          return (
            <StockLineFields
              key={field.id}
              item={
                <ItemSelect
                  materials={items.materials.filter(
                    (material) => material.isActive,
                  )}
                  products={items.products.filter(
                    (product) => product.isActive,
                  )}
                  error={errors.lines?.[index]?.item?.message}
                  {...form.register(`lines.${index}.item`)}
                />
              }
              quantityLabel={words.counted}
              itemType={item?.itemType}
              quantity={form.register(`lines.${index}.quantity`)}
              quantityError={errors.lines?.[index]?.quantity}
              info={
                item &&
                current !== null && (
                  <span className="grid">
                    <span>
                      {words.current(formatQuantity(item.itemType, current))}
                    </span>
                    {counted !== null && (
                      <LineInfo problem={counted !== current}>
                        {words.difference(
                          formatChange(item.itemType, counted - current),
                        )}
                      </LineInfo>
                    )}
                  </span>
                )
              }
              onRemove={
                lines.fields.length > 1 ? () => lines.remove(index) : undefined
              }
            />
          );
        })}
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

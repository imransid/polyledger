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
import { formatQuantity } from '@/lib/format';
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

const words = text.stock.transfer;

const transferForm = z
  .object({
    fromLocationId: z.string().min(1, text.required),
    toLocationId: z.string().min(1, text.required),
    lines: stockLines,
  })
  .refine((transfer) => transfer.fromLocationId !== transfer.toLocationId, {
    message: words.sameLocation,
    path: ['toLocationId'],
  });

export function TransferPage() {
  const locations = useAllLocations();
  const items = useItems();
  if (!locations.data || !items.ready) {
    return <RecordPending error={locations.error ?? items.error} />;
  }
  return (
    <TransferForm
      locations={locations.data.filter((location) => location.isActive)}
    />
  );
}

function TransferForm({ locations }: { locations: Location[] }) {
  const items = useItems();
  const posting = usePosting();
  const form = useForm({
    resolver: zodResolver(transferForm),
    defaultValues: { fromLocationId: '', toLocationId: '', lines: [emptyLine] },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const [fromLocationId, watched] = useWatch({
    control: form.control,
    name: ['fromLocationId', 'lines'],
  });
  const available = useLocationBalances(fromLocationId);
  const { errors, isSubmitting } = form.formState;

  // What each line asks against what the from-location holds now. The API
  // checks again under a lock; this only saves a pointless round trip.
  const checks = (watched ?? []).map((line) => {
    const item = parseItemValue(line.item ?? '');
    if (!item || !available.data) {
      return null;
    }
    const held = available.data.get(line.item ?? '') ?? 0;
    const wanted = parseAmount(item.itemType, line.quantity ?? '');
    return {
      itemType: item.itemType,
      held,
      over: wanted !== null && wanted > held,
    };
  });
  const overdrawn = checks.some((check) => check?.over);

  const submit = form.handleSubmit(
    async ({ fromLocationId, toLocationId, lines }) => {
      try {
        const document = await unwrap(
          api.POST('/stock/transfers', {
            body: {
              fromLocationId,
              toLocationId,
              lines: lines.map((line) =>
                apiLine(parseItemValue(line.item)!, line.quantity),
              ),
            },
            headers: posting.headers,
          }),
        );
        await posting.succeeded(document);
        form.reset({ fromLocationId, toLocationId, lines: [emptyLine] });
      } catch (error) {
        showApiError(form, error, {
          fromLocationId: 'fromLocationId',
          toLocationId: 'toLocationId',
        });
      }
    },
  );

  return (
    <RecordShell title={words.title}>
      <PostedNotice document={posting.posted} />
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={words.from}
            options={locationOptions(locations)}
            error={errors.fromLocationId?.message}
            {...form.register('fromLocationId')}
          />
          <SelectField
            label={words.to}
            options={locationOptions(locations)}
            error={errors.toLocationId?.message}
            {...form.register('toLocationId')}
          />
        </div>
        {lines.fields.map((field, index) => {
          const check = checks[index];
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
              quantityLabel={text.stock.quantity}
              itemType={check?.itemType}
              quantity={form.register(`lines.${index}.quantity`)}
              quantityError={errors.lines?.[index]?.quantity}
              info={
                check && (
                  <LineInfo problem={check.over}>
                    {(check.over ? words.tooMuch : words.available)(
                      formatQuantity(check.itemType, check.held),
                    )}
                  </LineInfo>
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
          <Button type="submit" disabled={isSubmitting || overdrawn}>
            {words.submit}
          </Button>
        </div>
      </form>
    </RecordShell>
  );
}

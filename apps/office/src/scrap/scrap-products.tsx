import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllLocations } from '@/api/lookups';
import type { Location, Product, ScrapReason } from '@/api/types';
import { PostedNotice } from '@/components/document-link';
import { ErrorMessage } from '@/components/message';
import { RecordPending } from '@/components/record-shell';
import { SelectField } from '@/components/select-field';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { showApiError } from '@/lib/form-errors';
import { formatPieces } from '@/lib/format';
import {
  emptyLine,
  locationOptions,
  parseAmount,
  parseItemValue,
  stockLines,
} from '@/stock/lines';
import { ItemSelect, LineInfo, StockLineFields } from '@/stock/parts';
import { useItems, useLocationBalances, usePosting } from '@/stock/use-stock';

const words = text.scrap.products;
const REASONS = Object.keys(words.reasons) as ScrapReason[];

const scrapForm = z.object({
  fromLocationId: z.string().min(1, text.required),
  toLocationId: z.string().min(1, text.required),
  reason: z.enum(REASONS, { error: words.chooseReason }),
  lines: stockLines,
});

export function ScrapProductsPage() {
  const locations = useAllLocations();
  const items = useItems();
  if (!locations.data || !items.ready) {
    return <RecordPending error={locations.error ?? items.error} />;
  }
  const active = locations.data.filter((location) => location.isActive);
  return (
    <ScrapProductsForm
      stores={active.filter(
        (location) => location.kind === 'FINISHED_GOODS_STORE',
      )}
      scrapYards={active.filter((location) => location.kind === 'SCRAP_YARD')}
      products={items.products.filter((product) => product.isActive)}
    />
  );
}

function ScrapProductsForm({
  stores,
  scrapYards,
  products,
}: {
  stores: Location[];
  scrapYards: Location[];
  products: Product[];
}) {
  const posting = usePosting();
  const form = useForm({
    resolver: zodResolver(scrapForm),
    defaultValues: {
      fromLocationId: stores.length === 1 ? stores[0].id : '',
      toLocationId: scrapYards.length === 1 ? scrapYards[0].id : '',
      reason: '' as ScrapReason,
      lines: [emptyLine],
    },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const [fromLocationId, watched] = useWatch({
    control: form.control,
    name: ['fromLocationId', 'lines'],
  });
  const available = useLocationBalances(fromLocationId);
  const { errors, isSubmitting } = form.formState;

  // What the store holds now; the API checks again under a lock.
  const checks = (watched ?? []).map((line) => {
    if (!parseItemValue(line.item ?? '') || !available.data) {
      return null;
    }
    const held = available.data.get(line.item ?? '') ?? 0;
    const wanted = parseAmount('PRODUCT', line.quantity ?? '');
    return { held, over: wanted !== null && wanted > held };
  });

  const submit = form.handleSubmit(async ({ lines, ...transfer }) => {
    try {
      const document = await unwrap(
        api.POST('/scrap/transfers', {
          body: {
            ...transfer,
            lines: lines.map((line) => ({
              productId: parseItemValue(line.item)!.itemId,
              pieces: Number(line.quantity.trim()),
            })),
          },
          headers: posting.headers,
        }),
      );
      await posting.succeeded(document);
      form.reset({ ...transfer, lines: [emptyLine] });
    } catch (error) {
      showApiError(form, error, {
        fromLocationId: 'fromLocationId',
        toLocationId: 'toLocationId',
        reason: 'reason',
      });
    }
  });

  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="text-xl font-semibold">{words.title}</h1>
      <PostedNotice document={posting.posted} />
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label={words.from}
            options={locationOptions(stores)}
            error={errors.fromLocationId?.message}
            {...form.register('fromLocationId')}
          />
          <SelectField
            label={words.to}
            options={locationOptions(scrapYards)}
            error={errors.toLocationId?.message}
            {...form.register('toLocationId')}
          />
          <SelectField
            label={words.reason}
            options={[
              { value: '', label: words.chooseReason },
              ...REASONS.map((reason) => ({
                value: reason,
                label: words.reasons[reason],
              })),
            ]}
            error={errors.reason?.message}
            {...form.register('reason')}
          />
        </div>
        {lines.fields.map((field, index) => {
          const check = checks[index];
          return (
            <StockLineFields
              key={field.id}
              item={
                <ItemSelect
                  materials={[]}
                  products={products}
                  error={errors.lines?.[index]?.item?.message}
                  {...form.register(`lines.${index}.item`)}
                />
              }
              quantityLabel={text.stock.quantity}
              itemType="PRODUCT"
              quantity={form.register(`lines.${index}.quantity`)}
              quantityError={errors.lines?.[index]?.quantity}
              info={
                check && (
                  <LineInfo problem={check.over}>
                    {(check.over
                      ? text.stock.transfer.tooMuch
                      : text.stock.transfer.available)(
                      formatPieces(check.held),
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
          <Button
            type="submit"
            disabled={isSubmitting || checks.some((check) => check?.over)}
          >
            {words.submit}
          </Button>
        </div>
      </form>
    </div>
  );
}

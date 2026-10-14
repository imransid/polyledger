import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllLocations } from '@/api/lookups';
import type { Location, Product, RawMaterial } from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { RecordPending } from '@/components/record-shell';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { parseDecimal } from '@/lib/decimal';
import { showApiError } from '@/lib/form-errors';
import { requiredText } from '@/lib/form-fields';
import { formatMoney, formatWeight } from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import {
  apiLine,
  locationOptions,
  parseItemValue,
  stockLine,
} from '@/stock/lines';
import { ItemSelect } from '@/stock/parts';
import { useItems } from '@/stock/use-stock';
import { lineGrams, saleLine, saleTotals } from './sums';

const words = text.scrap.sale;
const emptySaleLine = { item: '', quantity: '', price: '' };

const saleForm = z.object({
  buyerName: requiredText(100),
  scrapLocationId: z.string().min(1, text.required),
  lines: z
    .array(
      stockLine.safeExtend({ price: z.string() }).superRefine((line, ctx) => {
        if (parseDecimal(line.price, 2) === null) {
          ctx.issues.push({
            code: 'custom',
            message: text.valid.money,
            path: ['price'],
            input: line.price,
          });
        }
      }),
    )
    .min(1, text.stock.noLines)
    .refine(
      (lines) => new Set(lines.map((line) => line.item)).size === lines.length,
      text.stock.sameItemTwice,
    ),
});

export function ScrapSalePage() {
  const locations = useAllLocations();
  const items = useItems();
  if (!locations.data || !items.ready) {
    return <RecordPending error={locations.error ?? items.error} />;
  }
  return (
    <ScrapSaleForm
      scrapYards={locations.data.filter(
        (location) => location.isActive && location.kind === 'SCRAP_YARD',
      )}
      materials={items.materials.filter((material) => material.isActive)}
      products={items.products.filter((product) => product.isActive)}
    />
  );
}

interface ScrapSaleFormProps {
  scrapYards: Location[];
  materials: RawMaterial[];
  products: Product[];
}

// The form stays open for the next sale.
function ScrapSaleForm({
  scrapYards,
  materials,
  products,
}: ScrapSaleFormProps) {
  const write = useWrite('scrap', 'stock');
  const [posted, setPosted] = useState<string>();
  const form = useForm({
    resolver: zodResolver(saleForm),
    defaultValues: {
      buyerName: '',
      scrapLocationId: scrapYards.length === 1 ? scrapYards[0].id : '',
      lines: [emptySaleLine],
    },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const watched = useWatch({ control: form.control, name: 'lines' });
  const { errors, isSubmitting } = form.formState;

  // Worked out as the figures are typed; the API prices the sale again.
  const figures = (watched ?? []).map((line) => {
    const item = parseItemValue(line.item ?? '');
    if (!item) {
      return null;
    }
    const pieceWeightMg = products.find(
      (product) => product.id === item.itemId,
    )?.pieceWeightMg;
    return saleLine(
      lineGrams(item.itemType, line.quantity ?? '', pieceWeightMg),
      line.price ?? '',
    );
  });
  const totals = saleTotals(figures);

  const submit = form.handleSubmit(async ({ lines, ...sale }) => {
    setPosted(undefined);
    try {
      const created = await unwrap(
        api.POST('/scrap/sales', {
          body: {
            ...sale,
            lines: lines.map((line) => ({
              ...apiLine(parseItemValue(line.item)!, line.quantity),
              pricePerKgPoisha: parseDecimal(line.price, 2)!,
            })),
          },
          headers: write.headers,
        }),
      );
      await write.done();
      setPosted(formatMoney(created.amountPoisha));
      form.reset({
        buyerName: '',
        scrapLocationId: sale.scrapLocationId,
        lines: [emptySaleLine],
      });
    } catch (error) {
      showApiError(form, error, {
        buyerName: 'buyerName',
        scrapLocationId: 'scrapLocationId',
      });
    }
  });

  return (
    <div className="grid max-w-3xl gap-6">
      <h1 className="text-xl font-semibold">{words.title}</h1>
      {posted && (
        <Alert>
          <AlertDescription>{words.posted(posted)}</AlertDescription>
        </Alert>
      )}
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={words.buyer}
            error={errors.buyerName?.message}
            {...form.register('buyerName')}
          />
          <SelectField
            label={words.scrapYard}
            options={locationOptions(scrapYards)}
            error={errors.scrapLocationId?.message}
            {...form.register('scrapLocationId')}
          />
        </div>
        {lines.fields.map((field, index) => {
          const item = parseItemValue(watched?.[index]?.item ?? '');
          const lineErrors = errors.lines?.[index];
          return (
            <div key={field.id} className="flex flex-wrap items-start gap-2">
              <div className="min-w-56 flex-1">
                <ItemSelect
                  materials={materials}
                  products={products}
                  error={lineErrors?.item?.message}
                  {...form.register(`lines.${index}.item`)}
                />
              </div>
              <div className="w-32">
                <TextField
                  label={`${text.stock.quantity} (${
                    item?.itemType === 'PRODUCT'
                      ? text.stock.pieces
                      : text.stock.kilograms
                  })`}
                  inputMode={
                    item?.itemType === 'PRODUCT' ? 'numeric' : 'decimal'
                  }
                  className="text-right tabular-nums"
                  error={lineErrors?.quantity?.message}
                  {...form.register(`lines.${index}.quantity`)}
                />
              </div>
              <div className="w-32">
                <TextField
                  label={words.pricePerKg}
                  inputMode="decimal"
                  className="text-right tabular-nums"
                  error={lineErrors?.price?.message}
                  {...form.register(`lines.${index}.price`)}
                />
              </div>
              <div className="min-w-28 pt-8 text-right text-sm tabular-nums">
                {figures[index] && formatMoney(figures[index].amountPoisha)}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-6"
                aria-label={text.stock.removeLine}
                disabled={lines.fields.length === 1}
                onClick={() => lines.remove(index)}
              >
                <X />
              </Button>
            </div>
          );
        })}
        <ErrorMessage
          message={errors.lines?.root?.message ?? errors.lines?.message}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => lines.append(emptySaleLine)}
          >
            <Plus />
            {text.stock.addLine}
          </Button>
          <p className="font-semibold tabular-nums" aria-live="polite">
            {words.totals(
              formatWeight(totals.grams),
              formatMoney(totals.amountPoisha),
            )}
          </p>
        </div>
        <ErrorMessage message={errors.root?.message} />
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {words.submit}
          </Button>
        </div>
      </form>
    </div>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllLocations } from '@/api/lookups';
import type {
  Location,
  Product,
  RawMaterial,
  StockItemType,
} from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { RecordPending } from '@/components/record-shell';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { parseDecimal } from '@/lib/decimal';
import { showApiError } from '@/lib/form-errors';
import { formatPercent, formatWeight } from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import { apiLine, locationOptions, parseAmount } from '@/stock/lines';
import { useItems } from '@/stock/use-stock';
import { grindingLoss, lineGrams } from './sums';

const words = text.scrap.grinding;
const INPUT_TYPES = Object.keys(words.inputKinds) as StockItemType[];

const grindingForm = z
  .object({
    scrapLocationId: z.string().min(1, text.required),
    storeLocationId: z.string().min(1, text.required),
    inputType: z.enum(INPUT_TYPES),
    inputItemId: z.string().min(1, text.required),
    inputQuantity: z.string(),
    outputMaterialId: z.string().min(1, text.required),
    outputKg: z
      .string()
      .refine((kg) => parseDecimal(kg, 3) !== null, text.valid.kilograms),
  })
  .superRefine((batch, ctx) => {
    if (parseAmount(batch.inputType, batch.inputQuantity) === null) {
      ctx.issues.push({
        code: 'custom',
        message:
          batch.inputType === 'PRODUCT'
            ? text.valid.wholeNumber
            : text.valid.kilograms,
        path: ['inputQuantity'],
        input: batch.inputQuantity,
      });
    }
  });

export function GrindingPage() {
  const locations = useAllLocations();
  const items = useItems();
  if (!locations.data || !items.ready) {
    return <RecordPending error={locations.error ?? items.error} />;
  }
  const active = locations.data.filter((location) => location.isActive);
  return (
    <GrindingForm
      scrapYards={active.filter((location) => location.kind === 'SCRAP_YARD')}
      stores={active.filter(
        (location) => location.kind === 'RAW_MATERIAL_STORE',
      )}
      regrinds={items.materials.filter(
        (material) => material.isActive && material.type === 'REGRIND',
      )}
      products={items.products.filter((product) => product.isActive)}
    />
  );
}

interface GrindingFormProps {
  scrapYards: Location[];
  stores: Location[];
  regrinds: RawMaterial[];
  products: Product[];
}

// The form stays open for the next batch.
function GrindingForm({
  scrapYards,
  stores,
  regrinds,
  products,
}: GrindingFormProps) {
  const write = useWrite('scrap', 'stock');
  const [posted, setPosted] = useState<string>();
  const form = useForm({
    resolver: zodResolver(grindingForm),
    defaultValues: {
      scrapLocationId: scrapYards.length === 1 ? scrapYards[0].id : '',
      storeLocationId: stores.length === 1 ? stores[0].id : '',
      inputType: 'RAW_MATERIAL' as StockItemType,
      inputItemId: '',
      inputQuantity: '',
      outputMaterialId: regrinds.length === 1 ? regrinds[0].id : '',
      outputKg: '',
    },
  });
  const [inputType, inputItemId, inputQuantity, outputKg] = useWatch({
    control: form.control,
    name: ['inputType', 'inputItemId', 'inputQuantity', 'outputKg'],
  });
  const { errors, isSubmitting } = form.formState;

  const inputGrams = lineGrams(
    inputType,
    inputQuantity,
    products.find((product) => product.id === inputItemId)?.pieceWeightMg,
  );
  const outputGrams = parseDecimal(outputKg, 3);
  const tooHeavy =
    inputGrams !== null && outputGrams !== null && outputGrams > inputGrams;
  const loss =
    inputGrams !== null && outputGrams !== null && !tooHeavy
      ? grindingLoss(inputGrams, outputGrams)
      : null;
  const inputs = inputType === 'PRODUCT' ? products : regrinds;

  const submit = form.handleSubmit(async (batch) => {
    setPosted(undefined);
    try {
      const created = await unwrap(
        api.POST('/scrap/grinding', {
          body: {
            scrapLocationId: batch.scrapLocationId,
            storeLocationId: batch.storeLocationId,
            input: apiLine(
              { itemType: batch.inputType, itemId: batch.inputItemId },
              batch.inputQuantity,
            ),
            outputMaterialId: batch.outputMaterialId,
            outputKilograms: batch.outputKg.trim(),
          },
          headers: write.headers,
        }),
      );
      await write.done();
      setPosted(formatWeight(created.lossGrams));
      form.reset({
        ...batch,
        inputItemId: '',
        inputQuantity: '',
        outputKg: '',
      });
    } catch (error) {
      showApiError(form, error, {
        scrapLocationId: 'scrapLocationId',
        storeLocationId: 'storeLocationId',
        input: 'inputQuantity',
        outputMaterialId: 'outputMaterialId',
        outputKilograms: 'outputKg',
      });
    }
  });

  return (
    <div className="grid max-w-2xl gap-6">
      <h1 className="text-xl font-semibold">{words.title}</h1>
      {posted && (
        <Alert>
          <AlertDescription>{words.posted(posted)}</AlertDescription>
        </Alert>
      )}
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={words.scrapYard}
            options={locationOptions(scrapYards)}
            error={errors.scrapLocationId?.message}
            {...form.register('scrapLocationId')}
          />
          <SelectField
            label={words.store}
            options={locationOptions(stores)}
            error={errors.storeLocationId?.message}
            {...form.register('storeLocationId')}
          />
        </div>
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-2 text-sm font-medium">{words.input}</legend>
          {INPUT_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                value={type}
                {...form.register('inputType', {
                  onChange: () => form.setValue('inputItemId', ''),
                })}
              />
              {words.inputKinds[type]}
            </label>
          ))}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <SelectField
            label={words.inputItem}
            options={[
              { value: '', label: words.chooseInput },
              ...inputs.map((item) => ({
                value: item.id,
                label: `${item.code} · ${item.name}`,
              })),
            ]}
            error={errors.inputItemId?.message}
            {...form.register('inputItemId')}
          />
          <TextField
            label={inputType === 'PRODUCT' ? words.inputPieces : words.inputKg}
            inputMode={inputType === 'PRODUCT' ? 'numeric' : 'decimal'}
            className="text-right tabular-nums"
            error={errors.inputQuantity?.message}
            {...form.register('inputQuantity')}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <SelectField
            label={words.output}
            options={[
              { value: '', label: words.chooseRegrind },
              ...regrinds.map((material) => ({
                value: material.id,
                label: `${material.code} · ${material.name}`,
              })),
            ]}
            error={errors.outputMaterialId?.message}
            {...form.register('outputMaterialId')}
          />
          <TextField
            label={words.outputKg}
            inputMode="decimal"
            className="text-right tabular-nums"
            error={errors.outputKg?.message}
            {...form.register('outputKg')}
          />
        </div>
        <div className="grid gap-1 text-sm" aria-live="polite">
          {inputType === 'PRODUCT' && inputGrams !== null && (
            <p className="text-muted-foreground">
              {words.inputWeighs(formatWeight(inputGrams))}
            </p>
          )}
          {tooHeavy && (
            <p className="font-medium text-destructive">
              {words.outputTooHeavy}
            </p>
          )}
          {loss && (
            <p className="text-base font-semibold">
              {words.loss(
                formatWeight(loss.lossGrams),
                formatPercent(loss.lossBasisPoints ?? 0),
              )}
            </p>
          )}
        </div>
        <ErrorMessage message={errors.root?.message} />
        <div>
          <Button type="submit" disabled={isSubmitting || tooHeavy}>
            {words.submit}
          </Button>
        </div>
      </form>
    </div>
  );
}

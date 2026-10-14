import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllLocations, useAllSuppliers } from '@/api/lookups';
import type { Location, Partner, RawMaterial } from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { factoryToday } from '@/lib/dates';
import { parseDecimal } from '@/lib/decimal';
import { showApiError } from '@/lib/form-errors';
import { requiredText } from '@/lib/form-fields';
import { shortage } from './lines';
import { LineInfo, PostedNotice } from './parts';
import { useItems, usePosting } from './use-stock';

const words = text.stock.receive;
const emptyLine = { rawMaterialId: '', challan: '', received: '' };

const receiveForm = z.object({
  supplierId: z.string().min(1, text.required),
  supplierReference: requiredText(50),
  receivedOn: z.iso.date(text.required),
  locationId: z.string().min(1, text.required),
  lines: z
    .array(
      z.object({
        rawMaterialId: z.string().min(1, text.required),
        challan: z
          .string()
          .refine(
            (kg) => (parseDecimal(kg, 3) ?? 0) > 0,
            words.challanAboveZero,
          ),
        received: z
          .string()
          .refine((kg) => parseDecimal(kg, 3) !== null, text.valid.kilograms),
      }),
    )
    .min(1, text.stock.noLines)
    .refine(
      (lines) =>
        new Set(lines.map((line) => line.rawMaterialId)).size === lines.length,
      text.stock.sameItemTwice,
    ),
});

export function ReceivePage() {
  const suppliers = useAllSuppliers();
  const locations = useAllLocations();
  const items = useItems();
  if (!suppliers.data || !locations.data || !items.ready) {
    return (
      <RecordPending
        error={suppliers.error ?? locations.error ?? items.error}
      />
    );
  }
  return (
    <ReceiveForm
      suppliers={suppliers.data.filter((supplier) => supplier.isActive)}
      stores={locations.data.filter(
        (location) =>
          location.isActive && location.kind === 'RAW_MATERIAL_STORE',
      )}
      materials={items.materials.filter((material) => material.isActive)}
    />
  );
}

interface ReceiveFormProps {
  suppliers: Partner[];
  stores: Location[];
  materials: RawMaterial[];
}

function ReceiveForm({ suppliers, stores, materials }: ReceiveFormProps) {
  const posting = usePosting();
  const form = useForm({
    resolver: zodResolver(receiveForm),
    defaultValues: {
      supplierId: '',
      supplierReference: '',
      receivedOn: factoryToday(),
      // Most plants have one store: then there is nothing to choose.
      locationId: stores.length === 1 ? stores[0].id : '',
      lines: [emptyLine],
    },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const watched = useWatch({ control: form.control, name: 'lines' });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (receipt) => {
    try {
      const document = await unwrap(
        api.POST('/stock/receipts', {
          body: {
            ...receipt,
            lines: receipt.lines.map((line) => ({
              rawMaterialId: line.rawMaterialId,
              challanKilograms: line.challan.trim(),
              receivedKilograms: line.received.trim(),
            })),
          },
          headers: posting.headers,
        }),
      );
      await posting.succeeded(document);
      // The next truck is often the same supplier, on the same day.
      form.reset({ ...receipt, supplierReference: '', lines: [emptyLine] });
    } catch (error) {
      showApiError(form, error, {
        supplierId: 'supplierId',
        supplierReference: 'supplierReference',
        receivedOn: 'receivedOn',
        locationId: 'locationId',
      });
    }
  });

  return (
    <RecordShell title={words.title}>
      <PostedNotice document={posting.posted} />
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={words.supplier}
            options={[
              { value: '', label: words.chooseSupplier },
              ...suppliers.map((supplier) => ({
                value: supplier.id,
                label: `${supplier.code} · ${supplier.name}`,
              })),
            ]}
            error={errors.supplierId?.message}
            {...form.register('supplierId')}
          />
          <TextField
            label={words.challan}
            error={errors.supplierReference?.message}
            {...form.register('supplierReference')}
          />
          <TextField
            label={words.receivedOn}
            type="date"
            error={errors.receivedOn?.message}
            {...form.register('receivedOn')}
          />
          <SelectField
            label={words.store}
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
        </div>
        {lines.fields.map((field, index) => (
          <div key={field.id} className="flex flex-wrap items-start gap-2">
            <div className="min-w-64 flex-1">
              <SelectField
                label={words.material}
                options={[
                  { value: '', label: text.stock.chooseItem },
                  ...materials.map((material) => ({
                    value: material.id,
                    label: `${material.code} · ${material.name}`,
                  })),
                ]}
                error={errors.lines?.[index]?.rawMaterialId?.message}
                {...form.register(`lines.${index}.rawMaterialId`)}
              />
            </div>
            <div className="w-32">
              <TextField
                label={words.challanKg}
                inputMode="decimal"
                className="text-right tabular-nums"
                error={errors.lines?.[index]?.challan?.message}
                {...form.register(`lines.${index}.challan`)}
              />
            </div>
            <div className="w-32">
              <TextField
                label={words.receivedKg}
                inputMode="decimal"
                className="text-right tabular-nums"
                error={errors.lines?.[index]?.received?.message}
                {...form.register(`lines.${index}.received`)}
              />
            </div>
            <div
              className="min-w-40 pt-8 text-right text-sm tabular-nums"
              data-testid="shortage"
            >
              <LineInfo>
                {shortage(
                  watched?.[index]?.challan ?? '',
                  watched?.[index]?.received ?? '',
                )}
              </LineInfo>
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

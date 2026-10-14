import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllLocations, useAllMachines, useAllProducts } from '@/api/lookups';
import type { Location, Machine, Product } from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { factoryToday } from '@/lib/dates';
import { showApiError } from '@/lib/form-errors';
import { wholeNumber } from '@/lib/form-fields';
import { formatDuration } from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import { runSeconds } from './run-time';

const words = text.production;

const jobCardForm = z.object({
  productId: z.string().min(1, text.required),
  mouldId: z.string().min(1, text.required),
  machineId: z.string().min(1, text.required),
  floorLocationId: z.string().min(1, text.required),
  plannedPieces: wholeNumber(),
  plannedStartDate: z.iso.date(text.required),
  salesOrderId: z.string(),
});

export function NewJobCardPage() {
  const products = useAllProducts();
  const machines = useAllMachines();
  const locations = useAllLocations();
  if (!products.data || !machines.data || !locations.data) {
    return (
      <RecordPending
        error={products.error ?? machines.error ?? locations.error}
      />
    );
  }
  return (
    <NewJobCard
      products={products.data.filter((product) => product.isActive)}
      machines={machines.data.filter((machine) => machine.status === 'ACTIVE')}
      floors={locations.data.filter(
        (location) => location.isActive && location.kind === 'PRODUCTION_FLOOR',
      )}
    />
  );
}

interface NewJobCardProps {
  products: Product[];
  machines: Machine[];
  floors: Location[];
}

function NewJobCard({ products, machines, floors }: NewJobCardProps) {
  const navigate = useNavigate();
  const write = useWrite('job-cards');
  const form = useForm({
    resolver: zodResolver(jobCardForm),
    defaultValues: {
      productId: '',
      mouldId: '',
      machineId: '',
      floorLocationId: floors.length === 1 ? floors[0].id : '',
      plannedPieces: '',
      plannedStartDate: factoryToday(),
      salesOrderId: '',
    },
  });
  const [productId, mouldId, plannedPieces] = useWatch({
    control: form.control,
    name: ['productId', 'mouldId', 'plannedPieces'],
  });
  // Only moulds that make the chosen product, and only those in use.
  const moulds = useQuery({
    queryKey: ['moulds', 'for-product', productId],
    enabled: productId !== '',
    queryFn: async () =>
      (
        await unwrap(
          api.GET('/moulds', {
            params: {
              query: { productId, status: 'ACTIVE', page: 1, pageSize: 200 },
            },
          }),
        )
      ).items,
  });
  // Orders still waiting for this product.
  const orders = useQuery({
    queryKey: ['sales-orders', 'open', productId],
    enabled: productId !== '',
    queryFn: async () => {
      const open = await Promise.all(
        (['CONFIRMED', 'IN_PRODUCTION'] as const).map((status) =>
          unwrap(
            api.GET('/sales-orders', {
              params: { query: { status, page: 1, pageSize: 200 } },
            }),
          ),
        ),
      );
      return open
        .flatMap((page) => page.items)
        .filter((order) =>
          order.lines.some((line) => line.productId === productId),
        );
    },
  });
  const mould = moulds.data?.find((m) => m.id === mouldId);
  const pieces = Number(plannedPieces);
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ salesOrderId, ...card }) => {
    try {
      const created = await unwrap(
        api.POST('/job-cards', {
          body: { ...card, salesOrderId: salesOrderId || null },
          headers: write.headers,
        }),
      );
      await write.created();
      navigate(`../${created.id}`, { relative: 'path', replace: true });
    } catch (error) {
      showApiError(form, error, {
        productId: 'productId',
        mouldId: 'mouldId',
        machineId: 'machineId',
        floorLocationId: 'floorLocationId',
        plannedPieces: 'plannedPieces',
        plannedStartDate: 'plannedStartDate',
        salesOrderId: 'salesOrderId',
      });
    }
  });

  return (
    <RecordShell title={words.new}>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={words.product}
            options={[
              { value: '', label: words.chooseProduct },
              ...products.map((product) => ({
                value: product.id,
                label: `${product.code} · ${product.name}`,
              })),
            ]}
            error={errors.productId?.message}
            {...form.register('productId', {
              onChange: () => {
                form.setValue('mouldId', '');
                form.setValue('salesOrderId', '');
              },
            })}
          />
          <SelectField
            label={words.mould}
            disabled={productId === ''}
            options={[
              {
                value: '',
                label:
                  productId === ''
                    ? words.chooseProductFirst
                    : words.chooseMould,
              },
              ...(moulds.data ?? []).map((m) => ({
                value: m.id,
                label: `${m.code} · ${m.name}`,
              })),
            ]}
            error={errors.mouldId?.message}
            {...form.register('mouldId')}
          />
          <SelectField
            label={words.machine}
            options={[
              { value: '', label: words.chooseMachine },
              ...machines.map((machine) => ({
                value: machine.id,
                label: `${machine.code} · ${machine.name}`,
              })),
            ]}
            error={errors.machineId?.message}
            {...form.register('machineId')}
          />
          <SelectField
            label={words.floor}
            options={[
              { value: '', label: text.stock.chooseLocation },
              ...floors.map((floor) => ({
                value: floor.id,
                label: `${floor.code} · ${floor.name}`,
              })),
            ]}
            error={errors.floorLocationId?.message}
            {...form.register('floorLocationId')}
          />
          <TextField
            label={words.plannedPieces}
            inputMode="numeric"
            className="text-right tabular-nums"
            error={errors.plannedPieces?.message}
            {...form.register('plannedPieces')}
          />
          <TextField
            label={words.plannedStart}
            type="date"
            error={errors.plannedStartDate?.message}
            {...form.register('plannedStartDate')}
          />
          <SelectField
            label={words.salesOrder}
            options={[
              { value: '', label: words.noSalesOrder },
              ...(orders.data ?? []).map((order) => ({
                value: order.id,
                label: order.number,
              })),
            ]}
            error={errors.salesOrderId?.message}
            {...form.register('salesOrderId')}
          />
        </div>
        {mould && Number.isSafeInteger(pieces) && pieces > 0 && (
          <p className="text-sm text-muted-foreground" data-testid="run-time">
            {words.runTime(
              formatDuration(
                runSeconds(pieces, mould.cavities, mould.cycleTimeTenths),
              ),
            )}
          </p>
        )}
        <ErrorMessage message={errors.root?.message} />
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {words.create}
          </Button>
        </div>
      </form>
    </RecordShell>
  );
}

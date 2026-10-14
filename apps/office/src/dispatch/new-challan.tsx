import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import {
  useAllCustomers,
  useAllLocations,
  useAllProducts,
} from '@/api/lookups';
import type {
  Location,
  OrderDelivery,
  Product,
  SalesOrder,
  SalesOrderStatus,
} from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { showApiError } from '@/lib/form-errors';
import { phone, requiredText } from '@/lib/form-fields';
import { formatPieces } from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import { itemValue, locationOptions } from '@/stock/lines';
import { LineInfo } from '@/stock/parts';
import { useLocationBalances } from '@/stock/use-stock';

const words = text.dispatch;
const DELIVERABLE: SalesOrderStatus[] = ['CONFIRMED', 'IN_PRODUCTION'];

// Each line may carry up to what is left of its order plus the tolerance; a
// blank line is simply not on this challan.
function challanForm(limits: number[]) {
  return z.object({
    fromLocationId: z.string().min(1, text.required),
    vehicleNumber: requiredText(30),
    driverName: requiredText(100),
    driverPhone: phone(),
    deliveryAddress: requiredText(300),
    notes: z.string().trim().max(1000),
    lines: z
      .array(z.object({ pieces: z.string().trim() }))
      .superRefine((lines, ctx) => {
        lines.forEach(({ pieces }, index) => {
          const message = !/^\d*$/.test(pieces)
            ? text.valid.wholeNumber
            : Number(pieces) > limits[index]
              ? words.overLimit(formatPieces(limits[index]))
              : undefined;
          if (message) {
            ctx.issues.push({
              code: 'custom',
              message,
              path: [index, 'pieces'],
              input: pieces,
            });
          }
        });
        if (lines.every(({ pieces }) => Number(pieces) === 0)) {
          ctx.issues.push({
            code: 'custom',
            message: words.noPieces,
            input: lines,
          });
        }
      }),
  });
}

function useDeliverableOrders() {
  return useQuery({
    queryKey: ['sales-orders', 'deliverable'],
    queryFn: async () => {
      const pages = await Promise.all(
        DELIVERABLE.map((status) =>
          unwrap(
            api.GET('/sales-orders', {
              params: { query: { status, page: 1, pageSize: 200 } },
            }),
          ),
        ),
      );
      return pages
        .flatMap((page) => page.items)
        .sort((a, b) => a.number.localeCompare(b.number));
    },
  });
}

// The order comes from the URL, so "New challan" on an order page opens
// with that order chosen.
export function NewChallanPage() {
  const [params, setParams] = useSearchParams();
  const orderId = params.get('order') ?? '';
  const orders = useDeliverableOrders();
  const customers = useAllCustomers();
  const locations = useAllLocations();
  const products = useAllProducts();
  if (!orders.data || !customers.data || !locations.data || !products.data) {
    return (
      <RecordPending
        error={
          orders.error ?? customers.error ?? locations.error ?? products.error
        }
      />
    );
  }
  const customerOf = (order: SalesOrder) =>
    customers.data.find((customer) => customer.id === order.customerId);
  const order = orders.data.find((candidate) => candidate.id === orderId);

  return (
    <RecordShell title={words.new}>
      <SelectField
        label={words.order}
        value={orderId}
        onChange={(event) =>
          setParams({ order: event.target.value }, { replace: true })
        }
        options={[
          { value: '', label: words.chooseOrder },
          ...orders.data.map((candidate) => ({
            value: candidate.id,
            label: [
              candidate.number,
              customerOf(candidate)?.code,
              candidate.customerPo,
            ]
              .filter(Boolean)
              .join(' · '),
          })),
        ]}
      />
      {orderId && !order && (
        <p className="text-sm text-muted-foreground">{words.notDeliverable}</p>
      )}
      {order && (
        <OrderChallan
          key={order.id}
          orderId={order.id}
          address={customerOf(order)?.address ?? ''}
          stores={locations.data.filter(
            (location) =>
              location.isActive && location.kind === 'FINISHED_GOODS_STORE',
          )}
          products={products.data}
        />
      )}
    </RecordShell>
  );
}

interface OrderChallanProps {
  orderId: string;
  address: string;
  stores: Location[];
  products: Product[];
}

function OrderChallan(props: OrderChallanProps) {
  const delivery = useQuery({
    queryKey: ['sales-orders', 'delivery', props.orderId],
    queryFn: () =>
      unwrap(
        api.GET('/sales-orders/{id}/delivery', {
          params: { path: { id: props.orderId } },
        }),
      ),
  });
  if (!delivery.data) {
    return <RecordPending error={delivery.error} />;
  }
  return <ChallanForm {...props} delivery={delivery.data} />;
}

function ChallanForm({
  orderId,
  address,
  stores,
  products,
  delivery,
}: OrderChallanProps & { delivery: OrderDelivery }) {
  const navigate = useNavigate();
  const write = useWrite('dispatch', 'sales-orders', 'stock');
  const lines = delivery.lines.filter((line) => line.allowedPieces > 0);
  const form = useForm({
    resolver: zodResolver(challanForm(lines.map((line) => line.allowedPieces))),
    defaultValues: {
      fromLocationId: stores.length === 1 ? stores[0].id : '',
      vehicleNumber: '',
      driverName: '',
      driverPhone: '',
      deliveryAddress: address,
      notes: '',
      lines: lines.map((line) => ({
        pieces: line.remainingPieces > 0 ? String(line.remainingPieces) : '',
      })),
    },
  });
  const [fromLocationId, typed] = useWatch({
    control: form.control,
    name: ['fromLocationId', 'lines'],
  });
  const available = useLocationBalances(fromLocationId);
  const { errors, isSubmitting } = form.formState;

  // What the store holds now; the API checks again under a lock.
  const held = (productId: string) =>
    available.data &&
    (available.data.get(
      itemValue({ itemType: 'PRODUCT', itemId: productId }),
    ) ??
      0);
  const short = lines.map((line, index) => {
    const inStore = held(line.productId);
    const wanted = Number(typed?.[index]?.pieces) || 0;
    return inStore !== undefined && wanted > inStore;
  });

  const submit = form.handleSubmit(
    async ({ lines: pieces, notes, ...challan }) => {
      try {
        const created = await unwrap(
          api.POST('/dispatch/challans', {
            body: {
              ...challan,
              orderId,
              notes: notes === '' ? null : notes,
              lines: lines
                .map((line, index) => ({
                  productId: line.productId,
                  pieces: Number(pieces[index].pieces),
                }))
                .filter((line) => line.pieces > 0),
            },
            headers: write.headers,
          }),
        );
        await write.created();
        navigate(`/dispatch/${created.id}`);
      } catch (error) {
        showApiError(form, error, {
          fromLocationId: 'fromLocationId',
          vehicleNumber: 'vehicleNumber',
          driverName: 'driverName',
          driverPhone: 'driverPhone',
          deliveryAddress: 'deliveryAddress',
          notes: 'notes',
        });
      }
    },
  );

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <SelectField
        label={words.store}
        options={locationOptions(stores)}
        error={errors.fromLocationId?.message}
        {...form.register('fromLocationId')}
      />
      {lines.map((line, index) => {
        const inStore = held(line.productId);
        return (
          <div
            key={line.productId}
            className="flex flex-wrap items-start gap-2"
          >
            <div className="min-w-56 flex-1 pt-6 text-sm">
              <p>
                <span className="font-medium">{line.code}</span> ·{' '}
                {
                  products.find((product) => product.id === line.productId)
                    ?.name
                }
              </p>
              <p className="text-muted-foreground">
                {words.stillToDeliver(formatPieces(line.remainingPieces))}
              </p>
            </div>
            <div className="w-36">
              <TextField
                label={words.piecesOf(line.code)}
                inputMode="numeric"
                className="text-right tabular-nums"
                error={errors.lines?.[index]?.pieces?.message}
                {...form.register(`lines.${index}.pieces`)}
              />
            </div>
            <div className="min-w-40 pt-8 text-right text-sm tabular-nums">
              {inStore !== undefined && (
                <LineInfo problem={short[index]}>
                  {(short[index] ? words.notInStore : words.inStore)(
                    formatPieces(inStore),
                  )}
                </LineInfo>
              )}
            </div>
          </div>
        );
      })}
      <ErrorMessage
        message={errors.lines?.root?.message ?? errors.lines?.message}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label={words.vehicle}
          error={errors.vehicleNumber?.message}
          {...form.register('vehicleNumber')}
        />
        <TextField
          label={words.driverName}
          error={errors.driverName?.message}
          {...form.register('driverName')}
        />
        <TextField
          label={words.driverPhone}
          inputMode="tel"
          placeholder="01XXXXXXXXX"
          error={errors.driverPhone?.message}
          {...form.register('driverPhone')}
        />
      </div>
      <TextField
        label={words.address}
        error={errors.deliveryAddress?.message}
        {...form.register('deliveryAddress')}
      />
      <TextField
        label={words.notes}
        error={errors.notes?.message}
        {...form.register('notes')}
      />
      <ErrorMessage message={errors.root?.message} />
      <div>
        <Button type="submit" disabled={isSubmitting || short.some(Boolean)}>
          {words.create}
        </Button>
      </div>
    </form>
  );
}

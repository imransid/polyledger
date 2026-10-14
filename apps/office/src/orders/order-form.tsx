import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllCustomers, useAllProducts } from '@/api/lookups';
import type { Partner, Product, SalesOrder } from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { factoryToday } from '@/lib/dates';
import { formatDecimal, parseDecimal } from '@/lib/decimal';
import { showApiError } from '@/lib/form-errors';
import { decimal, wholeNumber } from '@/lib/form-fields';
import { useWrite } from '@/lib/use-write';
import { useRecord } from '@/master-data/use-record';

const words = text.orders;
const emptyLine = { productId: '', pieces: '', price: '' };

// Prices are typed in taka ("1.25") and kept in poisha (125); blank means
// not priced yet.
const price = z.string().transform((value, ctx) => {
  if (value.trim() === '') {
    return null;
  }
  const poisha = parseDecimal(value, 2);
  if (poisha === null) {
    ctx.issues.push({
      code: 'custom',
      message: text.valid.money,
      input: value,
    });
    return z.NEVER;
  }
  return poisha;
});

const orderForm = z
  .object({
    customerId: z.string().min(1, text.required),
    orderDate: z.iso.date(text.required),
    deliveryDate: z.iso.date(text.required),
    customerPo: z.string().trim().max(50),
    notes: z.string().trim().max(1000),
    tolerance: decimal(2, text.valid.percent),
    lines: z
      .array(
        z.object({
          productId: z.string().min(1, text.required),
          pieces: wholeNumber(),
          price,
        }),
      )
      .min(1, text.stock.noLines)
      .refine(
        (lines) =>
          new Set(lines.map((line) => line.productId)).size === lines.length,
        text.stock.sameItemTwice,
      ),
  })
  .refine((order) => order.deliveryDate >= order.orderDate, {
    message: text.valid.deliveryBeforeOrder,
    path: ['deliveryDate'],
  });

export function NewOrderPage() {
  return <OrderFormLoader />;
}

export function EditOrderPage() {
  const { id = '' } = useParams();
  const order = useRecord('sales-orders', id, (id) =>
    unwrap(api.GET('/sales-orders/{id}', { params: { path: { id } } })),
  );
  if (!order.data) {
    return <RecordPending error={order.error} />;
  }
  return <OrderFormLoader order={order.data} />;
}

function OrderFormLoader({ order }: { order?: SalesOrder }) {
  const customers = useAllCustomers();
  const products = useAllProducts();
  if (!customers.data || !products.data) {
    return <RecordPending error={customers.error ?? products.error} />;
  }
  return (
    <OrderForm
      key={order?.id ?? 'new'}
      order={order}
      customers={customers.data}
      products={products.data}
    />
  );
}

interface OrderFormProps {
  order?: SalesOrder;
  customers: Partner[];
  products: Product[];
}

function OrderForm({ order, customers, products }: OrderFormProps) {
  const navigate = useNavigate();
  const write = useWrite('sales-orders');
  // A confirmed order is a promise to the customer: only the pieces, the
  // delivery date and the allowance may still move.
  const confirmed = order?.status === 'CONFIRMED';
  const form = useForm({
    resolver: zodResolver(orderForm),
    defaultValues: {
      customerId: order?.customerId ?? '',
      orderDate: order?.orderDate ?? factoryToday(),
      deliveryDate: order?.deliveryDate ?? '',
      customerPo: order?.customerPo ?? '',
      notes: order?.notes ?? '',
      tolerance: formatDecimal(order?.overDeliveryBasisPoints ?? 0, 2),
      lines: order
        ? order.lines.map((line) => ({
            productId: line.productId,
            pieces: String(line.pieces),
            price:
              line.unitPricePoisha === null
                ? ''
                : formatDecimal(line.unitPricePoisha, 2),
          }))
        : [emptyLine],
    },
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    const body = {
      deliveryDate: values.deliveryDate,
      overDeliveryBasisPoints: values.tolerance,
      lines: values.lines.map((line) => ({
        productId: line.productId,
        pieces: line.pieces,
        unitPricePoisha: line.price,
      })),
    };
    const draft = {
      ...body,
      customerId: values.customerId,
      orderDate: values.orderDate,
      customerPo: values.customerPo || null,
      notes: values.notes || null,
    };
    try {
      if (order) {
        await unwrap(
          api.PATCH('/sales-orders/{id}', {
            params: { path: { id: order.id } },
            body: confirmed ? body : draft,
            headers: write.headers,
          }),
        );
        await write.done();
        navigate('..', { relative: 'path' });
      } else {
        const created = await unwrap(
          api.POST('/sales-orders', { body: draft, headers: write.headers }),
        );
        await write.created();
        navigate(`../${created.id}`, { relative: 'path', replace: true });
      }
    } catch (error) {
      showApiError(form, error, {
        customerId: 'customerId',
        orderDate: 'orderDate',
        deliveryDate: 'deliveryDate',
        customerPo: 'customerPo',
        notes: 'notes',
        overDeliveryBasisPoints: 'tolerance',
      });
    }
  });

  // Locked fields are shown, not registered: the form keeps their values
  // from its defaults, where a disabled input would send nothing.
  const locked = (label: string, value: string) => (
    <TextField label={label} value={value} readOnly />
  );
  const customerName = (id: string) => {
    const customer = customers.find((c) => c.id === id);
    return customer ? `${customer.code} · ${customer.name}` : '';
  };
  const productName = (id: string) => {
    const product = products.find((p) => p.id === id);
    return product ? `${product.code} · ${product.name}` : '';
  };

  const productOptions = [
    { value: '', label: words.chooseProduct },
    ...products
      .filter(
        (product) =>
          product.isActive ||
          order?.lines.some((l) => l.productId === product.id),
      )
      .map((product) => ({
        value: product.id,
        label: `${product.code} · ${product.name}`,
      })),
  ];

  return (
    <RecordShell title={order ? `${order.number} · ${words.edit}` : words.new}>
      {confirmed && (
        <p className="text-sm text-muted-foreground">{words.confirmedRule}</p>
      )}
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {confirmed ? (
            locked(words.customer, customerName(order.customerId))
          ) : (
            <SelectField
              label={words.customer}
              options={[
                { value: '', label: words.chooseCustomer },
                ...customers
                  .filter(
                    (customer) =>
                      customer.isActive || customer.id === order?.customerId,
                  )
                  .map((customer) => ({
                    value: customer.id,
                    label: `${customer.code} · ${customer.name}`,
                  })),
              ]}
              error={errors.customerId?.message}
              {...form.register('customerId')}
            />
          )}
          {confirmed ? (
            locked(words.customerPo, order.customerPo ?? '')
          ) : (
            <TextField
              label={words.customerPo}
              error={errors.customerPo?.message}
              {...form.register('customerPo')}
            />
          )}
          {confirmed ? (
            locked(words.orderDate, order.orderDate)
          ) : (
            <TextField
              label={words.orderDate}
              type="date"
              error={errors.orderDate?.message}
              {...form.register('orderDate')}
            />
          )}
          <TextField
            label={words.deliveryDate}
            type="date"
            error={errors.deliveryDate?.message}
            {...form.register('deliveryDate')}
          />
          <TextField
            label={words.tolerance}
            inputMode="decimal"
            error={errors.tolerance?.message}
            {...form.register('tolerance')}
          />
          {confirmed ? (
            locked(words.notes, order.notes ?? '')
          ) : (
            <TextField
              label={words.notes}
              error={errors.notes?.message}
              {...form.register('notes')}
            />
          )}
        </div>
        {lines.fields.map((field, index) => (
          <div key={field.id} className="flex flex-wrap items-start gap-2">
            <div className="min-w-64 flex-1">
              {confirmed ? (
                locked(words.product, productName(field.productId))
              ) : (
                <SelectField
                  label={words.product}
                  options={productOptions}
                  error={errors.lines?.[index]?.productId?.message}
                  {...form.register(`lines.${index}.productId`)}
                />
              )}
            </div>
            <div className="w-32">
              <TextField
                label={words.pieces}
                inputMode="numeric"
                className="text-right tabular-nums"
                error={errors.lines?.[index]?.pieces?.message}
                {...form.register(`lines.${index}.pieces`)}
              />
            </div>
            <div className="w-40">
              {confirmed ? (
                locked(words.price, field.price)
              ) : (
                <TextField
                  label={words.price}
                  inputMode="decimal"
                  className="text-right tabular-nums"
                  error={errors.lines?.[index]?.price?.message}
                  {...form.register(`lines.${index}.price`)}
                />
              )}
            </div>
            {!confirmed && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-6"
                aria-label={words.removeLine}
                disabled={lines.fields.length === 1}
                onClick={() => lines.remove(index)}
              >
                <X />
              </Button>
            )}
          </div>
        ))}
        <ErrorMessage
          message={errors.lines?.root?.message ?? errors.lines?.message}
        />
        {!confirmed && (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => lines.append(emptyLine)}
            >
              <Plus />
              {words.addLine}
            </Button>
          </div>
        )}
        <ErrorMessage message={errors.root?.message} />
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {words.save}
          </Button>
        </div>
      </form>
    </RecordShell>
  );
}

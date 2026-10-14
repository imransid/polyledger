import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllCustomers, useAllProducts } from '@/api/lookups';
import type { Challan, JobCard, SalesOrder } from '@/api/types';
import { SALES_EDITORS } from '@/auth/permissions';
import { useUser } from '@/auth/use-session';
import { DataTable } from '@/components/data-table';
import { ErrorMessage } from '@/components/message';
import { ReasonButton } from '@/components/reason-button';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import {
  formatDay,
  formatMoney,
  formatPercent,
  formatPieces,
  formatWeight,
} from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import { LateBadge, OrderStatusBadge } from './parts';

const words = text.orders;

export function OrderPage() {
  const { id = '' } = useParams();
  const order = useQuery({
    queryKey: ['sales-orders', 'record', id],
    queryFn: () =>
      unwrap(api.GET('/sales-orders/{id}', { params: { path: { id } } })),
  });
  const customers = useAllCustomers();
  if (!order.data || !customers.data) {
    return <RecordPending error={order.error ?? customers.error} />;
  }
  const customer = customers.data.find((c) => c.id === order.data.customerId);
  return (
    <Order
      order={order.data}
      customerName={customer ? `${customer.code} · ${customer.name}` : ''}
    />
  );
}

function Order({
  order,
  customerName,
}: {
  order: SalesOrder;
  customerName: string;
}) {
  const canEdit = SALES_EDITORS.includes(useUser().role);
  const open = order.status !== 'COMPLETED' && order.status !== 'CANCELLED';
  return (
    <RecordShell
      title={`${order.number} · ${customerName}`}
      badge={
        <>
          <OrderStatusBadge status={order.status} />
          {order.late && <LateBadge />}
        </>
      }
      actions={canEdit && <OrderActions order={order} />}
    >
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{words.orderDate}</dt>
        <dd>{formatDay(order.orderDate)}</dd>
        <dt className="text-muted-foreground">{words.deliveryDate}</dt>
        <dd className={order.late ? 'font-medium text-destructive' : undefined}>
          {formatDay(order.deliveryDate)}
        </dd>
        {order.customerPo && (
          <>
            <dt className="text-muted-foreground">{words.customerPo}</dt>
            <dd>{order.customerPo}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{words.tolerance}</dt>
        <dd>{formatPercent(order.overDeliveryBasisPoints)}</dd>
        {(order.cancelReason ?? order.shortCloseReason) && (
          <>
            <dt className="text-muted-foreground">{words.reason}</dt>
            <dd>{order.cancelReason ?? order.shortCloseReason}</dd>
          </>
        )}
        {order.notes && (
          <>
            <dt className="text-muted-foreground">{words.notes}</dt>
            <dd>{order.notes}</dd>
          </>
        )}
      </dl>
      <Delivery order={order} />
      {open && <MaterialCheck orderId={order.id} />}
      <JobCards orderId={order.id} />
      <Challans orderId={order.id} />
    </RecordShell>
  );
}

function OrderActions({ order }: { order: SalesOrder }) {
  const write = useWrite('sales-orders');
  const options = {
    params: { path: { id: order.id } },
    headers: write.headers,
  };
  const step = async (call: Promise<unknown>) => {
    await call;
    await write.done();
  };
  return (
    <>
      {(order.status === 'DRAFT' || order.status === 'CONFIRMED') && (
        <Button variant="outline" size="sm" asChild>
          <Link to="edit">{words.edit}</Link>
        </Button>
      )}
      {order.status === 'DRAFT' && (
        <Button
          size="sm"
          onClick={() =>
            void step(unwrap(api.POST('/sales-orders/{id}/confirm', options)))
          }
        >
          {words.confirm}
        </Button>
      )}
      {order.status === 'CONFIRMED' && (
        <Button
          size="sm"
          onClick={() =>
            void step(
              unwrap(api.POST('/sales-orders/{id}/start-production', options)),
            )
          }
        >
          {words.startProduction}
        </Button>
      )}
      {(order.status === 'DRAFT' || order.status === 'CONFIRMED') && (
        <ReasonButton
          label={words.cancel}
          question={words.confirmCancel(order.number)}
          reasonLabel={words.reason}
          onConfirm={(reason) =>
            step(
              unwrap(
                api.POST('/sales-orders/{id}/cancel', {
                  ...options,
                  body: { reason },
                }),
              ),
            )
          }
        />
      )}
      {order.status === 'IN_PRODUCTION' && (
        <ReasonButton
          label={words.closeShort}
          question={words.confirmCloseShort(order.number)}
          reasonLabel={words.reason}
          onConfirm={(reason) =>
            step(
              unwrap(
                api.POST('/sales-orders/{id}/close-short', {
                  ...options,
                  body: { reason },
                }),
              ),
            )
          }
        />
      )}
    </>
  );
}

function Delivery({ order }: { order: SalesOrder }) {
  const delivery = useQuery({
    queryKey: ['sales-orders', 'delivery', order.id],
    queryFn: () =>
      unwrap(
        api.GET('/sales-orders/{id}/delivery', {
          params: { path: { id: order.id } },
        }),
      ),
  });
  const priceOf = (productId: string) =>
    order.lines.find((line) => line.productId === productId)?.unitPricePoisha ??
    null;
  return (
    <section className="grid gap-2">
      <h2 className="font-semibold">{words.delivery}</h2>
      <ErrorMessage message={delivery.error?.message} />
      <DataTable
        rows={delivery.data?.lines ?? []}
        rowKey={(line) => line.lineNo}
        columns={[
          { header: words.product, cell: (line) => line.code },
          {
            header: words.ordered,
            numeric: true,
            cell: (line) => formatPieces(line.orderedPieces),
          },
          {
            header: words.delivered,
            numeric: true,
            cell: (line) => formatPieces(line.deliveredPieces),
          },
          {
            header: words.returned,
            numeric: true,
            cell: (line) => formatPieces(line.returnedPieces),
          },
          {
            header: words.remaining,
            numeric: true,
            cell: (line) => formatPieces(line.remainingPieces),
          },
          {
            header: words.value,
            numeric: true,
            cell: (line) => {
              const price = priceOf(line.productId);
              return price === null
                ? ''
                : formatMoney(price * line.orderedPieces);
            },
          },
        ]}
      />
    </section>
  );
}

function MaterialCheck({ orderId }: { orderId: string }) {
  const check = useQuery({
    queryKey: ['sales-orders', 'material-check', orderId],
    queryFn: () =>
      unwrap(
        api.GET('/sales-orders/{id}/material-check', {
          params: { path: { id: orderId } },
        }),
      ),
  });
  return (
    <section className="grid gap-2">
      <h2 className="font-semibold">{words.materialCheck}</h2>
      {/* A product without an active formula is a warning to act on, not a failure. */}
      {check.error && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {check.error.message}
        </p>
      )}
      {check.data && (
        <DataTable
          rows={check.data.materials}
          rowKey={(material) => material.rawMaterialId}
          columns={[
            { header: text.masterData.code, cell: (material) => material.code },
            { header: text.masterData.name, cell: (material) => material.name },
            {
              header: words.needed,
              numeric: true,
              cell: (material) => formatWeight(material.neededGrams),
            },
            {
              header: words.available,
              numeric: true,
              cell: (material) => formatWeight(material.availableGrams),
            },
            {
              header: words.short,
              numeric: true,
              cell: (material) =>
                material.shortageGrams > 0 ? (
                  <span className="font-medium text-destructive">
                    {formatWeight(material.shortageGrams)}
                  </span>
                ) : (
                  formatWeight(0)
                ),
            },
          ]}
        />
      )}
    </section>
  );
}

function JobCards({ orderId }: { orderId: string }) {
  const products = useAllProducts();
  const cards = useQuery({
    queryKey: ['job-cards', 'list', { salesOrderId: orderId }],
    queryFn: () =>
      unwrap(
        api.GET('/job-cards', {
          params: { query: { salesOrderId: orderId, page: 1, pageSize: 200 } },
        }),
      ),
  });
  return (
    <section className="grid gap-2">
      <h2 className="font-semibold">{words.jobCards}</h2>
      {cards.data?.total === 0 ? (
        <p className="text-sm text-muted-foreground">{words.nothingYet}</p>
      ) : (
        <DataTable<JobCard>
          rows={cards.data?.items ?? []}
          rowKey={(card) => card.id}
          columns={[
            {
              header: text.production.number,
              cell: (card) => (
                <Link
                  to={`/production/${card.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {card.number}
                </Link>
              ),
            },
            {
              header: words.product,
              cell: (card) =>
                products.data?.find((p) => p.id === card.productId)?.code,
            },
            {
              header: text.production.plannedStart,
              cell: (card) => formatDay(card.plannedStartDate),
            },
            {
              header: text.production.plannedPieces,
              numeric: true,
              cell: (card) => formatPieces(card.plannedPieces),
            },
            {
              header: text.masterData.status,
              cell: (card) => text.production.statuses[card.status],
            },
          ]}
        />
      )}
    </section>
  );
}

function Challans({ orderId }: { orderId: string }) {
  const challans = useQuery({
    queryKey: ['dispatch', 'challans', orderId],
    queryFn: () =>
      unwrap(api.GET('/dispatch/challans', { params: { query: { orderId } } })),
  });
  return (
    <section className="grid gap-2">
      <h2 className="font-semibold">{words.challans}</h2>
      {challans.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{words.nothingYet}</p>
      ) : (
        <DataTable<Challan>
          rows={challans.data ?? []}
          rowKey={(challan) => challan.id}
          columns={[
            {
              header: text.stock.documents.number,
              cell: (challan) => (
                <Link
                  to={`/stock/documents/${challan.stockDocumentId}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {challan.number}
                </Link>
              ),
            },
            {
              header: text.stock.card.date,
              cell: (challan) => formatDay(challan.dispatchedOn),
            },
            {
              header: words.pieces,
              numeric: true,
              cell: (challan) =>
                formatPieces(
                  challan.lines.reduce((sum, line) => sum + line.pieces, 0),
                ),
            },
            {
              header: text.masterData.status,
              cell: (challan) =>
                challan.reversedAt ? text.stock.documents.reversed : '',
            },
          ]}
        />
      )}
    </section>
  );
}

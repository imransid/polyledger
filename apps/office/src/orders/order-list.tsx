import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllCustomers } from '@/api/lookups';
import type { SalesOrder, SalesOrderStatus } from '@/api/types';
import { SALES_EDITORS } from '@/auth/permissions';
import { useUser } from '@/auth/use-session';
import { CustomerName } from '@/components/customer-name';
import { DataTable } from '@/components/data-table';
import { ErrorMessage } from '@/components/message';
import { Pager } from '@/components/pager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUrlFilters } from '@/components/use-url-filters';
import { text } from '@/i18n';
import { formatDay } from '@/lib/format';
import { LateBadge, OrderStatusBadge } from './parts';

const words = text.orders;
const PAGE_SIZE = 25;
const STATUSES = Object.keys(words.statuses) as SalesOrderStatus[];
const filterClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm';

// Soonest delivery first, as the API sorts; late ones stand out in red.
export function OrderList() {
  const filters = useUrlFilters();
  const customers = useAllCustomers();
  const canEdit = SALES_EDITORS.includes(useUser().role);
  const query = {
    search: filters.value('search') || undefined,
    status: STATUSES.find((status) => status === filters.value('status')),
    customerId: filters.value('customer') || undefined,
    deliveryFrom: filters.value('from') || undefined,
    deliveryTo: filters.value('to') || undefined,
    open: filters.value('open') === 'true' ? ('true' as const) : undefined,
    late: filters.value('late') === 'true' ? ('true' as const) : undefined,
    page: filters.page,
    pageSize: PAGE_SIZE,
  };
  const orders = useQuery({
    queryKey: ['sales-orders', 'list', query],
    queryFn: () => unwrap(api.GET('/sales-orders', { params: { query } })),
    placeholderData: keepPreviousData,
  });
  const customer = (id: string) => {
    const found = customers.data?.find((candidate) => candidate.id === id);
    return found && <CustomerName name={found.name} code={found.code} />;
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input
          className="max-w-xs"
          placeholder={words.search}
          aria-label={words.search}
          value={filters.value('search')}
          onChange={(event) => filters.change('search', event.target.value)}
        />
        <select
          aria-label={text.masterData.status}
          className={filterClass}
          value={filters.value('status')}
          onChange={(event) => filters.change('status', event.target.value)}
        >
          <option value="">{words.allStatuses}</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {words.statuses[status]}
            </option>
          ))}
        </select>
        <select
          aria-label={words.customer}
          className={filterClass}
          value={filters.value('customer')}
          onChange={(event) => filters.change('customer', event.target.value)}
        >
          <option value="">{words.allCustomers}</option>
          {customers.data?.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.code} · {customer.name}
            </option>
          ))}
        </select>
        <label className="grid gap-1 text-sm">
          {words.deliveryFrom}
          <input
            type="date"
            className={filterClass}
            value={filters.value('from')}
            onChange={(event) => filters.change('from', event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {words.deliveryTo}
          <input
            type="date"
            className={filterClass}
            value={filters.value('to')}
            onChange={(event) => filters.change('to', event.target.value)}
          />
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.value('open') === 'true'}
            onChange={(event) =>
              filters.change('open', String(event.target.checked))
            }
          />
          {words.openOnly}
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.value('late') === 'true'}
            onChange={(event) =>
              filters.change('late', String(event.target.checked))
            }
          />
          {words.lateOnly}
        </label>
        {canEdit && (
          <Button size="sm" className="ml-auto" asChild>
            <Link to="new">
              <Plus />
              {words.new}
            </Link>
          </Button>
        )}
      </div>
      <ErrorMessage message={orders.error?.message} />
      {orders.data?.total === 0 ? (
        <p className="text-muted-foreground">{text.list.noMatch}</p>
      ) : (
        <DataTable<SalesOrder>
          rows={orders.data?.items ?? []}
          rowKey={(order) => order.id}
          rowClass={(order) =>
            order.late
              ? 'border-l-4 border-l-destructive bg-destructive/5'
              : undefined
          }
          columns={[
            {
              header: words.number,
              cell: (order) => (
                <Link
                  to={order.id}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {order.number}
                </Link>
              ),
            },
            {
              header: words.customer,
              cell: (order) => customer(order.customerId),
            },
            { header: words.customerPo, cell: (order) => order.customerPo },
            {
              header: words.deliveryDate,
              cell: (order) => (
                <span className="flex items-center gap-2">
                  {formatDay(order.deliveryDate)}
                  {order.late && <LateBadge />}
                </span>
              ),
            },
            {
              header: text.masterData.status,
              cell: (order) => <OrderStatusBadge status={order.status} />,
            },
          ]}
        />
      )}
      <Pager
        page={filters.page}
        pages={Math.max(1, Math.ceil((orders.data?.total ?? 0) / PAGE_SIZE))}
        onPage={(page) => filters.change('page', String(page))}
      />
    </div>
  );
}

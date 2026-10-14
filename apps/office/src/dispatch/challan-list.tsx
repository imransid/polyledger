import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllCustomers } from '@/api/lookups';
import type { Challan, GatePassStatus } from '@/api/types';
import { DISPATCHERS } from '@/auth/permissions';
import { useUser } from '@/auth/use-session';
import { CustomerName } from '@/components/customer-name';
import { DataTable } from '@/components/data-table';
import { ErrorMessage } from '@/components/message';
import { Pager } from '@/components/pager';
import { Button } from '@/components/ui/button';
import { useUrlFilters } from '@/components/use-url-filters';
import { text } from '@/i18n';
import { formatDay, formatPieces } from '@/lib/format';
import { ChallanStatusBadge } from './parts';
import { totalPieces } from './use-dispatch';

const words = text.dispatch;
const PAGE_SIZE = 25;
const GATE_PASS_STATUSES = Object.keys(
  words.gatePassStatuses,
) as GatePassStatus[];
const filterClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm';

// Newest first, as the API sorts.
export function ChallanList() {
  const filters = useUrlFilters();
  const customers = useAllCustomers();
  const canDispatch = DISPATCHERS.includes(useUser().role);
  const query = {
    customerId: filters.value('customer') || undefined,
    from: filters.value('from') || undefined,
    to: filters.value('to') || undefined,
    gatePass: GATE_PASS_STATUSES.find(
      (status) => status === filters.value('gatePass'),
    ),
    page: filters.page,
    pageSize: PAGE_SIZE,
  };
  const challans = useQuery({
    queryKey: ['dispatch', 'list', query],
    queryFn: () => unwrap(api.GET('/dispatch/challans', { params: { query } })),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
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
          {words.from}
          <input
            type="date"
            className={filterClass}
            value={filters.value('from')}
            onChange={(event) => filters.change('from', event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {words.to}
          <input
            type="date"
            className={filterClass}
            value={filters.value('to')}
            onChange={(event) => filters.change('to', event.target.value)}
          />
        </label>
        <select
          aria-label={words.gatePass}
          className={filterClass}
          value={filters.value('gatePass')}
          onChange={(event) => filters.change('gatePass', event.target.value)}
        >
          <option value="">{words.anyGatePass}</option>
          {GATE_PASS_STATUSES.map((status) => (
            <option key={status} value={status}>
              {words.gatePassStatuses[status]}
            </option>
          ))}
        </select>
        {canDispatch && (
          <Button size="sm" className="ml-auto" asChild>
            <Link to="new">
              <Plus />
              {words.new}
            </Link>
          </Button>
        )}
      </div>
      <ErrorMessage message={challans.error?.message} />
      {challans.data?.total === 0 ? (
        <p className="text-muted-foreground">{text.list.noMatch}</p>
      ) : (
        <DataTable<Challan>
          rows={challans.data?.items ?? []}
          rowKey={(challan) => challan.id}
          columns={[
            {
              header: words.number,
              cell: (challan) => (
                <Link
                  to={challan.id}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {challan.number}
                </Link>
              ),
            },
            {
              header: words.date,
              cell: (challan) => formatDay(challan.dispatchedOn),
            },
            {
              header: words.customer,
              cell: (challan) => (
                <CustomerName
                  name={challan.customerName}
                  code={challan.customerCode}
                />
              ),
            },
            { header: words.order, cell: (challan) => challan.orderNumber },
            { header: words.vehicle, cell: (challan) => challan.vehicleNumber },
            {
              header: words.pieces,
              numeric: true,
              cell: (challan) => formatPieces(totalPieces(challan.lines)),
            },
            {
              header: words.gatePass,
              cell: (challan) => <ChallanStatusBadge challan={challan} />,
            },
          ]}
        />
      )}
      <Pager
        page={filters.page}
        pages={Math.max(1, Math.ceil((challans.data?.total ?? 0) / PAGE_SIZE))}
        onPage={(page) => filters.change('page', String(page))}
      />
    </div>
  );
}

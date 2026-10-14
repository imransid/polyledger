import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Link } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllMachines, useAllProducts } from '@/api/lookups';
import type { JobCard, JobCardStatus } from '@/api/types';
import { JOB_PLANNERS } from '@/auth/permissions';
import { useUser } from '@/auth/use-session';
import { DataTable } from '@/components/data-table';
import { ErrorMessage } from '@/components/message';
import { Pager } from '@/components/pager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUrlFilters } from '@/components/use-url-filters';
import { text } from '@/i18n';
import { formatDay, formatPieces } from '@/lib/format';
import { JobCardStatusBadge } from './parts';

const words = text.production;
const PAGE_SIZE = 25;
const STATUSES = Object.keys(words.statuses) as JobCardStatus[];
const filterClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm';

export function JobCardList() {
  const filters = useUrlFilters();
  const machines = useAllMachines();
  const products = useAllProducts();
  const canPlan = JOB_PLANNERS.includes(useUser().role);
  const query = {
    search: filters.value('search') || undefined,
    status: STATUSES.find((status) => status === filters.value('status')),
    machineId: filters.value('machine') || undefined,
    productId: filters.value('product') || undefined,
    plannedFrom: filters.value('from') || undefined,
    plannedTo: filters.value('to') || undefined,
    page: filters.page,
    pageSize: PAGE_SIZE,
  };
  const cards = useQuery({
    queryKey: ['job-cards', 'list', query],
    queryFn: () => unwrap(api.GET('/job-cards', { params: { query } })),
    placeholderData: keepPreviousData,
  });
  const machineCode = (id: string) =>
    machines.data?.find((m) => m.id === id)?.code ?? '';
  const productCode = (id: string) =>
    products.data?.find((p) => p.id === id)?.code ?? '';

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
          aria-label={words.machine}
          className={filterClass}
          value={filters.value('machine')}
          onChange={(event) => filters.change('machine', event.target.value)}
        >
          <option value="">{words.allMachines}</option>
          {machines.data?.map((machine) => (
            <option key={machine.id} value={machine.id}>
              {machine.code} · {machine.name}
            </option>
          ))}
        </select>
        <select
          aria-label={words.product}
          className={filterClass}
          value={filters.value('product')}
          onChange={(event) => filters.change('product', event.target.value)}
        >
          <option value="">{words.allProducts}</option>
          {products.data?.map((product) => (
            <option key={product.id} value={product.id}>
              {product.code} · {product.name}
            </option>
          ))}
        </select>
        <label className="grid gap-1 text-sm">
          {words.plannedFrom}
          <input
            type="date"
            className={filterClass}
            value={filters.value('from')}
            onChange={(event) => filters.change('from', event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {words.plannedTo}
          <input
            type="date"
            className={filterClass}
            value={filters.value('to')}
            onChange={(event) => filters.change('to', event.target.value)}
          />
        </label>
        {canPlan && (
          <Button size="sm" className="ml-auto" asChild>
            <Link to="new">
              <Plus />
              {words.new}
            </Link>
          </Button>
        )}
      </div>
      <ErrorMessage message={cards.error?.message} />
      {cards.data?.total === 0 ? (
        <p className="text-muted-foreground">{text.list.noMatch}</p>
      ) : (
        <DataTable<JobCard>
          rows={cards.data?.items ?? []}
          rowKey={(card) => card.id}
          columns={[
            {
              header: words.number,
              cell: (card) => (
                <Link
                  to={card.id}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {card.number}
                </Link>
              ),
            },
            {
              header: words.product,
              cell: (card) => productCode(card.productId),
            },
            {
              header: words.machine,
              cell: (card) => machineCode(card.machineId),
            },
            {
              header: words.plannedStart,
              cell: (card) => formatDay(card.plannedStartDate),
            },
            {
              header: words.plannedPieces,
              numeric: true,
              cell: (card) => formatPieces(card.plannedPieces),
            },
            {
              header: text.masterData.status,
              cell: (card) => <JobCardStatusBadge status={card.status} />,
            },
          ]}
        />
      )}
      <Pager
        page={filters.page}
        pages={Math.max(1, Math.ceil((cards.data?.total ?? 0) / PAGE_SIZE))}
        onPage={(page) => filters.change('page', String(page))}
      />
    </div>
  );
}

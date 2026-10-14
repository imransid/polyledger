import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Link } from 'react-router';
import type { Page } from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { text } from '@/i18n';
import { DataTable } from './data-table';
import type { Column, Filter, ListQuery } from './list-options';
import { Pager } from './pager';
import { useUrlFilters } from './use-url-filters';

const PAGE_SIZE = 25;

interface ListPageProps<T> {
  title: string;
  queryKey: string;
  load: (query: ListQuery, filter: string) => Promise<Page<T>>;
  filter: Filter;
  columns: Column<T>[];
  canCreate: boolean;
  searchLabel?: string;
}

// Search, filter and page live in the URL, so Back returns to the same view.
// The API sorts by code.
export function ListPage<T extends { id: string }>({
  title,
  queryKey,
  load,
  filter,
  columns,
  canCreate,
  searchLabel = text.list.search,
}: ListPageProps<T>) {
  const filters = useUrlFilters();
  const search = filters.value('search');
  const filterValue = filters.value('filter', filter.initial);
  const page = filters.page;
  const query: ListQuery = {
    search: search || undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: [queryKey, 'list', query, filterValue],
    queryFn: () => load(query, filterValue),
    placeholderData: keepPreviousData,
  });

  const change = filters.change;

  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE));
  const narrowed = search !== '' || filterValue !== filter.initial;
  // Shown in the empty state instead of the header, once the list is known.
  const empty = list.data?.total === 0;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{title}</h1>
        {canCreate && list.data && !(empty && !narrowed) && <CreateButton />}
      </div>
      <div className="flex gap-2">
        <Input
          className="max-w-xs"
          placeholder={searchLabel}
          aria-label={searchLabel}
          value={search}
          onChange={(event) => change('search', event.target.value)}
        />
        <select
          aria-label={filter.options[0].label}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          value={filterValue}
          onChange={(event) => change('filter', event.target.value)}
        >
          {filter.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <ErrorMessage message={list.error?.message} />
      {empty ? (
        <div className="grid justify-items-start gap-3 rounded-md border p-6">
          <p className="text-muted-foreground">
            {narrowed ? text.list.noMatch : text.list.empty}
          </p>
          {canCreate && !narrowed && <CreateButton />}
        </div>
      ) : (
        <DataTable
          rows={list.data?.items ?? []}
          columns={columns}
          rowKey={(row) => row.id}
        />
      )}
      <Pager
        page={page}
        pages={pages}
        onPage={(next) => change('page', String(next))}
      />
    </div>
  );
}

function CreateButton() {
  return (
    <Button asChild size="sm">
      <Link to="new">
        <Plus />
        {text.list.create}
      </Link>
    </Button>
  );
}

/** The code, linking to the record. */
export function CodeLink({ id, code }: { id: string; code: string }) {
  return (
    <Link to={id} className="font-medium underline-offset-4 hover:underline">
      {code}
    </Link>
  );
}

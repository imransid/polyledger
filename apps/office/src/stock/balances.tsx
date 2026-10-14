import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllLocations } from '@/api/lookups';
import type { Balance, StockCardLine, StockItemType } from '@/api/types';
import { DataTable } from '@/components/data-table';
import { ErrorMessage } from '@/components/message';
import { Pager } from '@/components/pager';
import { RecordPending } from '@/components/record-shell';
import { Input } from '@/components/ui/input';
import { useUrlFilters } from '@/components/use-url-filters';
import { text } from '@/i18n';
import { formatChange, formatMoment, formatQuantity } from '@/lib/format';
import { DocumentLink } from '@/components/document-link';
import { useItems } from './use-stock';

const words = text.stock;
const PAGE_SIZE = 25;
const ITEM_TYPES: StockItemType[] = ['RAW_MATERIAL', 'PRODUCT'];
const filterClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm';

function itemTypeParam(value: string): StockItemType | undefined {
  return ITEM_TYPES.find((type) => type === value);
}

/** The stock card of one item, at one location or all of them. */
function cardPath(
  itemType: StockItemType,
  itemId: string,
  locationId?: string,
) {
  const query = new URLSearchParams({ itemType, itemId });
  if (locationId) {
    query.set('locationId', locationId);
  }
  return `/stock/card?${query}`;
}

export function BalancesPage() {
  const filters = useUrlFilters();
  const locations = useAllLocations();
  const items = useItems();
  // The API sorts by item type, then code.
  const query = {
    search: filters.value('search') || undefined,
    locationId: filters.value('location') || undefined,
    itemType: itemTypeParam(filters.value('type')),
    page: filters.page,
    pageSize: PAGE_SIZE,
  };
  const balances = useQuery({
    queryKey: ['stock', 'balances', query],
    queryFn: () => unwrap(api.GET('/stock/balances', { params: { query } })),
    placeholderData: keepPreviousData,
  });
  const locationCode = (id: string) =>
    locations.data?.find((location) => location.id === id)?.code ?? '';

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder={text.list.search}
          aria-label={text.list.search}
          value={filters.value('search')}
          onChange={(event) => filters.change('search', event.target.value)}
        />
        <select
          aria-label={words.location}
          className={filterClass}
          value={filters.value('location')}
          onChange={(event) => filters.change('location', event.target.value)}
        >
          <option value="">{words.allLocations}</option>
          {locations.data?.map((location) => (
            <option key={location.id} value={location.id}>
              {location.code} · {location.name}
            </option>
          ))}
        </select>
        <select
          aria-label={words.itemType}
          className={filterClass}
          value={filters.value('type')}
          onChange={(event) => filters.change('type', event.target.value)}
        >
          <option value="">{words.allItemTypes}</option>
          {ITEM_TYPES.map((type) => (
            <option key={type} value={type}>
              {words.itemTypes[type]}
            </option>
          ))}
        </select>
      </div>
      <ErrorMessage message={balances.error?.message} />
      {balances.data?.total === 0 ? (
        <p className="text-muted-foreground">{text.list.noMatch}</p>
      ) : (
        <DataTable<Balance>
          rows={balances.data?.items ?? []}
          rowKey={(balance) =>
            `${balance.itemType}:${balance.itemId}:${balance.locationId}`
          }
          columns={[
            {
              header: text.masterData.code,
              cell: (balance) => (
                <Link
                  to={cardPath(
                    balance.itemType,
                    balance.itemId,
                    balance.locationId,
                  )}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {balance.itemCode}
                </Link>
              ),
            },
            {
              header: text.masterData.name,
              cell: (balance) =>
                items.find(balance.itemType, balance.itemId)?.name,
            },
            {
              header: words.itemType,
              cell: (balance) => words.itemTypes[balance.itemType],
            },
            {
              header: words.location,
              cell: (balance) => locationCode(balance.locationId),
            },
            {
              header: words.quantity,
              numeric: true,
              cell: (balance) =>
                formatQuantity(
                  balance.itemType,
                  balance.pieces ?? balance.grams,
                ),
            },
          ]}
        />
      )}
      <Pager
        page={filters.page}
        pages={Math.max(1, Math.ceil((balances.data?.total ?? 0) / PAGE_SIZE))}
        onPage={(page) => filters.change('page', String(page))}
      />
    </div>
  );
}

export function StockCardPage() {
  const filters = useUrlFilters();
  const items = useItems();
  const locations = useAllLocations();
  const itemType = itemTypeParam(filters.value('itemType'));
  const itemId = filters.value('itemId');
  const query = {
    itemType: itemType ?? 'RAW_MATERIAL',
    itemId,
    locationId: filters.value('locationId') || undefined,
    page: filters.page,
    pageSize: PAGE_SIZE,
  };
  const card = useQuery({
    queryKey: ['stock', 'card', query],
    queryFn: () => unwrap(api.GET('/stock/card', { params: { query } })),
    enabled: itemType !== undefined && itemId !== '',
    placeholderData: keepPreviousData,
  });
  if (!itemType || !items.ready || !locations.data) {
    return <RecordPending error={items.error ?? locations.error} />;
  }
  const item = items.find(itemType, itemId);
  const locationCode = (id: string) =>
    locations.data.find((location) => location.id === id)?.code ?? '';

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">
          {words.card.title(item?.code ?? '')}
          <span className="font-normal text-muted-foreground">
            {' '}
            · {item?.name}
          </span>
        </h1>
        <select
          aria-label={words.location}
          className={filterClass}
          value={filters.value('locationId')}
          onChange={(event) => filters.change('locationId', event.target.value)}
        >
          <option value="">{words.allLocations}</option>
          {locations.data.map((location) => (
            <option key={location.id} value={location.id}>
              {location.code} · {location.name}
            </option>
          ))}
        </select>
      </div>
      <ErrorMessage message={card.error?.message} />
      <DataTable<StockCardLine>
        rows={card.data?.items ?? []}
        rowKey={(line) => line.entryId}
        columns={[
          {
            header: words.card.date,
            cell: (line) => formatMoment(line.postedAt),
          },
          {
            header: words.documents.kind,
            cell: (line) => words.kinds[line.movementType],
          },
          {
            header: words.card.document,
            cell: (line) => (
              <DocumentLink id={line.documentId} number={line.documentNumber} />
            ),
          },
          {
            header: words.location,
            cell: (line) => locationCode(line.locationId),
          },
          {
            header: words.documents.change,
            numeric: true,
            cell: (line) => formatChange(itemType, line.pieces ?? line.grams),
          },
          {
            header: words.card.balance,
            numeric: true,
            cell: (line) =>
              formatQuantity(itemType, line.balancePieces ?? line.balanceGrams),
          },
        ]}
      />
      <Pager
        page={filters.page}
        pages={Math.max(1, Math.ceil((card.data?.total ?? 0) / PAGE_SIZE))}
        onPage={(page) => filters.change('page', String(page))}
      />
    </div>
  );
}

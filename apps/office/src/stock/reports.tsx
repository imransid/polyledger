import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllSuppliers } from '@/api/lookups';
import type { LowStockLine, Shortages } from '@/api/types';
import { DataTable } from '@/components/data-table';
import { ErrorMessage } from '@/components/message';
import { useUrlFilters } from '@/components/use-url-filters';
import { text } from '@/i18n';
import { addDays, factoryToday } from '@/lib/dates';
import { formatDay, formatWeight } from '@/lib/format';
import { DocumentLink } from './parts';
import { useItems } from './use-stock';

const words = text.stock;
const filterClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm';

export function LowStockPage() {
  const lowStock = useQuery({
    queryKey: ['stock', 'low-stock'],
    queryFn: () => unwrap(api.GET('/stock/low-stock')),
  });
  if (lowStock.data?.length === 0) {
    return <p className="text-muted-foreground">{words.lowStock.none}</p>;
  }
  return (
    <div className="grid gap-4">
      <ErrorMessage message={lowStock.error?.message} />
      <DataTable<LowStockLine>
        rows={lowStock.data ?? []}
        rowKey={(line) => line.rawMaterialId}
        columns={[
          {
            header: text.masterData.code,
            cell: (line) => (
              <Link
                to={`/stock/card?itemType=RAW_MATERIAL&itemId=${line.rawMaterialId}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {line.code}
              </Link>
            ),
          },
          { header: text.masterData.name, cell: (line) => line.name },
          {
            header: words.lowStock.minimum,
            numeric: true,
            cell: (line) => formatWeight(line.minimumStockGrams),
          },
          {
            header: words.lowStock.inStock,
            numeric: true,
            cell: (line) => formatWeight(line.stockGrams),
          },
          {
            header: words.lowStock.short,
            numeric: true,
            cell: (line) => formatWeight(line.shortByGrams),
          },
        ]}
      />
    </div>
  );
}

type ShortageLine = Shortages['items'][number];

/** What suppliers billed but our scale did not see, by supplier and date. */
export function ShortagesPage() {
  const filters = useUrlFilters();
  const suppliers = useAllSuppliers();
  const items = useItems();
  const today = factoryToday();
  const query = {
    supplierId: filters.value('supplier') || undefined,
    from: filters.value('from', addDays(today, -30)),
    to: filters.value('to', today),
  };
  const shortages = useQuery({
    queryKey: ['stock', 'shortages', query],
    queryFn: () =>
      unwrap(api.GET('/stock/receipts/shortages', { params: { query } })),
  });
  const supplierCode = (id: string) =>
    suppliers.data?.find((supplier) => supplier.id === id)?.code ?? '';

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <select
          aria-label={words.receive.supplier}
          className={filterClass}
          value={filters.value('supplier')}
          onChange={(event) => filters.change('supplier', event.target.value)}
        >
          <option value="">{words.shortages.allSuppliers}</option>
          {suppliers.data?.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.code} · {supplier.name}
            </option>
          ))}
        </select>
        <label className="grid gap-1 text-sm">
          {words.documents.from}
          <input
            type="date"
            className={filterClass}
            value={query.from}
            onChange={(event) => filters.change('from', event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {words.documents.to}
          <input
            type="date"
            className={filterClass}
            value={query.to}
            onChange={(event) => filters.change('to', event.target.value)}
          />
        </label>
      </div>
      <ErrorMessage message={shortages.error?.message} />
      {shortages.data?.items.length === 0 ? (
        <p className="text-muted-foreground">{words.shortages.none}</p>
      ) : (
        <>
          <DataTable<ShortageLine>
            rows={shortages.data?.items ?? []}
            rowKey={(line) => `${line.documentId}:${line.rawMaterialId}`}
            columns={[
              {
                header: words.card.document,
                cell: (line) => (
                  <DocumentLink
                    id={line.documentId}
                    number={line.documentNumber}
                  />
                ),
              },
              {
                header: words.documents.receivedOn,
                cell: (line) => formatDay(line.receivedOn),
              },
              {
                header: words.receive.supplier,
                cell: (line) => supplierCode(line.supplierId),
              },
              {
                header: words.documents.challan,
                cell: (line) => line.supplierReference,
              },
              {
                header: words.item,
                cell: (line) =>
                  items.find('RAW_MATERIAL', line.rawMaterialId)?.code,
              },
              {
                header: words.documents.challanKg,
                numeric: true,
                cell: (line) => formatWeight(line.challanGrams),
              },
              {
                header: words.documents.receivedKg,
                numeric: true,
                cell: (line) => formatWeight(line.receivedGrams),
              },
              {
                header: words.documents.shortKg,
                numeric: true,
                cell: (line) => formatWeight(line.shortGrams),
              },
            ]}
          />
          {shortages.data && (
            <p className="text-right font-medium tabular-nums">
              {words.shortages.total(
                formatWeight(shortages.data.totalShortGrams),
              )}
            </p>
          )}
        </>
      )}
    </div>
  );
}

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllLocations, useAllSuppliers } from '@/api/lookups';
import type { StockDocument, StockDocumentSummary } from '@/api/types';
import { canManageStock } from '@/auth/permissions';
import { useUser } from '@/auth/use-session';
import { ConfirmButton } from '@/components/confirm-button';
import { DataTable } from '@/components/data-table';
import { ErrorMessage } from '@/components/message';
import { Pager } from '@/components/pager';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { TextField } from '@/components/text-field';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useUrlFilters } from '@/components/use-url-filters';
import { text } from '@/i18n';
import {
  formatChange,
  formatDay,
  formatMoment,
  formatWeight,
} from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import { DOCUMENT_KINDS, kindParam } from './kinds';
import { DocumentLink, PostedNotice } from './parts';
import { useItems } from './use-stock';

const words = text.stock.documents;
const PAGE_SIZE = 25;
const filterClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm';

export function DocumentsPage() {
  const filters = useUrlFilters();
  const query = {
    search: filters.value('search') || undefined,
    kind: kindParam(filters.value('kind')),
    from: filters.value('from') || undefined,
    to: filters.value('to') || undefined,
    page: filters.page,
    pageSize: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: ['stock', 'documents', query],
    queryFn: () => unwrap(api.GET('/stock/documents', { params: { query } })),
    placeholderData: keepPreviousData,
  });

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
          aria-label={words.kind}
          className={filterClass}
          value={filters.value('kind')}
          onChange={(event) => filters.change('kind', event.target.value)}
        >
          <option value="">{words.allKinds}</option>
          {DOCUMENT_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {text.stock.kinds[kind]}
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
      </div>
      <ErrorMessage message={list.error?.message} />
      {list.data?.total === 0 ? (
        <p className="text-muted-foreground">{text.list.noMatch}</p>
      ) : (
        <DataTable<StockDocumentSummary>
          rows={list.data?.items ?? []}
          rowKey={(document) => document.id}
          columns={[
            {
              header: words.number,
              cell: (document) => <DocumentLink {...document} />,
            },
            {
              header: words.kind,
              cell: (document) => text.stock.kinds[document.kind],
            },
            {
              header: words.posted,
              cell: (document) => formatMoment(document.postedAt),
            },
            { header: words.by, cell: (document) => document.postedByName },
            {
              header: words.reference,
              cell: (document) =>
                document.supplierReference ?? document.reason ?? '',
            },
            {
              header: text.masterData.status,
              cell: (document) =>
                document.reversedAt && (
                  <Badge variant="secondary">{words.reversed}</Badge>
                ),
            },
          ]}
        />
      )}
      <Pager
        page={filters.page}
        pages={Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE))}
        onPage={(page) => filters.change('page', String(page))}
      />
    </div>
  );
}

export function DocumentPage() {
  const { id = '' } = useParams();
  const document = useQuery({
    queryKey: ['stock', 'document', id],
    queryFn: () =>
      unwrap(api.GET('/stock/documents/{id}', { params: { path: { id } } })),
  });
  const items = useItems();
  const locations = useAllLocations();
  const suppliers = useAllSuppliers();
  if (!document.data || !items.ready || !locations.data || !suppliers.data) {
    return (
      <RecordPending
        error={
          document.error ?? items.error ?? locations.error ?? suppliers.error
        }
      />
    );
  }
  const codeOf = (id: string) =>
    locations.data.find((location) => location.id === id)?.code ?? '';
  const supplier = suppliers.data.find(
    (s) => s.id === document.data.supplierId,
  );
  return (
    <DocumentView
      document={document.data}
      itemCode={(itemType, itemId) => items.find(itemType, itemId)?.code ?? ''}
      locationCode={codeOf}
      supplierName={
        supplier ? `${supplier.code} · ${supplier.name}` : undefined
      }
    />
  );
}

interface DocumentViewProps {
  document: StockDocument;
  itemCode: (itemType: 'RAW_MATERIAL' | 'PRODUCT', itemId: string) => string;
  locationCode: (id: string) => string;
  supplierName?: string;
}

function DocumentView({
  document,
  itemCode,
  locationCode,
  supplierName,
}: DocumentViewProps) {
  const canReverse = canManageStock(useUser().role) && document.reversible;
  const [reversal, setReversal] = useState<{ id: string; number: string }>();

  return (
    <RecordShell
      title={`${document.number} · ${text.stock.kinds[document.kind]}`}
      badge={
        document.reversedAt && (
          <Badge variant="secondary">{words.reversed}</Badge>
        )
      }
      actions={
        canReverse && (
          <ReverseButton document={document} onReversed={setReversal} />
        )
      }
    >
      <PostedNotice document={reversal} />
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{words.posted}</dt>
        <dd>
          {formatMoment(document.postedAt)} · {document.postedByName}
        </dd>
        {supplierName && (
          <>
            <dt className="text-muted-foreground">{words.supplier}</dt>
            <dd>{supplierName}</dd>
          </>
        )}
        {document.supplierReference && (
          <>
            <dt className="text-muted-foreground">{words.challan}</dt>
            <dd>{document.supplierReference}</dd>
          </>
        )}
        {document.receivedOn && (
          <>
            <dt className="text-muted-foreground">{words.receivedOn}</dt>
            <dd>{formatDay(document.receivedOn.slice(0, 10))}</dd>
          </>
        )}
        {document.reason && (
          <>
            <dt className="text-muted-foreground">{words.reason}</dt>
            <dd>{document.reason}</dd>
          </>
        )}
      </dl>
      {document.reversesId && (
        <Link
          to={`/stock/documents/${document.reversesId}`}
          className="text-sm underline-offset-4 hover:underline"
        >
          {words.reversesOriginal}
        </Link>
      )}
      {document.receiptLines.length > 0 && (
        <DataTable
          rows={document.receiptLines}
          rowKey={(line) => line.rawMaterialId}
          columns={[
            {
              header: text.stock.item,
              cell: (line) => itemCode('RAW_MATERIAL', line.rawMaterialId),
            },
            {
              header: words.challanKg,
              numeric: true,
              cell: (line) => formatWeight(line.challanGrams),
            },
            {
              header: words.receivedKg,
              numeric: true,
              cell: (line) => formatWeight(line.receivedGrams),
            },
            {
              header: words.shortKg,
              numeric: true,
              cell: (line) =>
                formatWeight(line.challanGrams - line.receivedGrams),
            },
          ]}
        />
      )}
      <DataTable
        rows={document.entries}
        rowKey={(entry) => entry.id}
        columns={[
          {
            header: text.stock.item,
            cell: (entry) => itemCode(entry.itemType, entry.itemId),
          },
          {
            header: text.stock.location,
            cell: (entry) => locationCode(entry.locationId),
          },
          {
            header: words.change,
            numeric: true,
            cell: (entry) =>
              formatChange(entry.itemType, entry.pieces ?? entry.grams),
          },
        ]}
      />
    </RecordShell>
  );
}

function ReverseButton({
  document,
  onReversed,
}: {
  document: StockDocument;
  onReversed: (reversal: { id: string; number: string }) => void;
}) {
  const write = useWrite('stock');
  const [reason, setReason] = useState('');
  return (
    <ConfirmButton
      label={words.reverse}
      question={words.confirmReverse(document.number)}
      variant="destructive"
      onConfirm={async () => {
        if (reason.trim() === '') {
          throw new Error(words.reasonRequired);
        }
        const reversal = await unwrap(
          api.POST('/stock/documents/{id}/reverse', {
            params: { path: { id: document.id } },
            body: { reason: reason.trim() },
            headers: write.headers,
          }),
        );
        onReversed(reversal);
        await write.done();
      }}
    >
      <TextField
        label={words.reverseReason}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
    </ConfirmButton>
  );
}

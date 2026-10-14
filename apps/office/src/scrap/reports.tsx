import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type {
  GrindingBatch,
  ScrapSale,
  WasteReportGroup,
  WasteReportRow,
} from '@/api/types';
import { GRINDING_REVERSERS, SCRAP_MANAGERS } from '@/auth/permissions';
import { useUser } from '@/auth/use-session';
import { DataTable } from '@/components/data-table';
import { ErrorMessage } from '@/components/message';
import { ReasonButton } from '@/components/reason-button';
import { useUrlFilters } from '@/components/use-url-filters';
import { text } from '@/i18n';
import { factoryToday } from '@/lib/dates';
import {
  formatDay,
  formatMoney,
  formatPercent,
  formatPieces,
  formatWeight,
} from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import { useItems } from '@/stock/use-stock';
import { grindingLoss } from './sums';

const words = text.scrap.reports;
const GROUPS = Object.keys(words.groups) as WasteReportGroup[];
const filterClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm';

interface Range {
  from: string;
  to: string;
}

// This month so far unless the URL says otherwise. Money (scrap sales) is
// only asked for, and shown, for those who may see it.
export function ScrapReports() {
  const role = useUser().role;
  const filters = useUrlFilters();
  const today = factoryToday();
  const range = {
    from: filters.value('from', `${today.slice(0, 8)}01`),
    to: filters.value('to', today),
  };
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">
          {words.from}
          <input
            type="date"
            className={filterClass}
            value={range.from}
            onChange={(event) => filters.change('from', event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          {words.to}
          <input
            type="date"
            className={filterClass}
            value={range.to}
            onChange={(event) => filters.change('to', event.target.value)}
          />
        </label>
      </div>
      <GrindingLoss
        range={range}
        canReverse={GRINDING_REVERSERS.includes(role)}
      />
      {SCRAP_MANAGERS.includes(role) && <ScrapSales range={range} />}
      <WasteReport
        range={range}
        group={GROUPS.find((group) => group === filters.value('group'))}
        onGroup={(group) => filters.change('group', group)}
      />
    </div>
  );
}

function GrindingLoss({
  range,
  canReverse,
}: {
  range: Range;
  canReverse: boolean;
}) {
  const items = useItems();
  const report = useQuery({
    queryKey: ['scrap', 'grinding', range],
    queryFn: () =>
      unwrap(api.GET('/scrap/grinding', { params: { query: range } })),
    placeholderData: keepPreviousData,
  });
  const code = (batch: GrindingBatch) =>
    items.find(batch.inputItemType, batch.inputItemId)?.code ?? '';
  const totals = report.data?.totals;
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">{words.grinding}</h2>
      <ErrorMessage message={report.error?.message} />
      {totals && (
        <Figures>
          <Figure label={words.batches} value={String(totals.batches)} />
          <Figure label={words.input} value={formatWeight(totals.inputGrams)} />
          <Figure
            label={words.output}
            value={formatWeight(totals.outputGrams)}
          />
          <Figure label={words.loss} value={formatWeight(totals.lossGrams)} />
          {totals.lossBasisPoints !== null && (
            <Figure
              label={words.lossPercent}
              value={formatPercent(totals.lossBasisPoints)}
            />
          )}
        </Figures>
      )}
      {report.data?.batches.length === 0 ? (
        <p className="text-sm text-muted-foreground">{words.none}</p>
      ) : (
        <DataTable<GrindingBatch>
          rows={report.data?.batches ?? []}
          rowKey={(batch) => batch.id}
          columns={[
            { header: words.date, cell: (batch) => formatDay(batch.groundOn) },
            {
              header: words.input,
              cell: (batch) =>
                batch.inputPieces === null
                  ? `${code(batch)} ${formatWeight(batch.inputGrams)}`
                  : `${code(batch)} ${formatPieces(batch.inputPieces)} (${formatWeight(batch.inputGrams)})`,
            },
            {
              header: words.output,
              numeric: true,
              cell: (batch) => formatWeight(batch.outputGrams),
            },
            {
              header: words.loss,
              numeric: true,
              cell: (batch) => formatWeight(batch.lossGrams),
            },
            {
              header: words.lossPercent,
              numeric: true,
              cell: (batch) => {
                const { lossBasisPoints } = grindingLoss(
                  batch.inputGrams,
                  batch.outputGrams,
                );
                return lossBasisPoints === null
                  ? ''
                  : formatPercent(lossBasisPoints);
              },
            },
            {
              header: text.masterData.status,
              cell: (batch) =>
                batch.reversedAt
                  ? text.scrap.reversed
                  : canReverse && <ReverseBatch batch={batch} />,
            },
          ]}
        />
      )}
    </section>
  );
}

function ReverseBatch({ batch }: { batch: GrindingBatch }) {
  const write = useWrite('scrap', 'stock');
  return (
    <ReasonButton
      label={text.scrap.reverse}
      question={words.confirmReverseBatch}
      reasonLabel={text.scrap.reverseReason}
      onConfirm={async (reason) => {
        await unwrap(
          api.POST('/scrap/grinding/{id}/reverse', {
            params: { path: { id: batch.id } },
            body: { reason },
            headers: write.headers,
          }),
        );
        await write.done();
      }}
    />
  );
}

function ScrapSales({ range }: { range: Range }) {
  const report = useQuery({
    queryKey: ['scrap', 'sales', range],
    queryFn: () =>
      unwrap(api.GET('/scrap/sales', { params: { query: range } })),
    placeholderData: keepPreviousData,
  });
  const totals = report.data?.totals;
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">{words.sales}</h2>
      <ErrorMessage message={report.error?.message} />
      {totals && (
        <Figures>
          <Figure label={words.salesCount} value={String(totals.sales)} />
          <Figure label={words.weight} value={formatWeight(totals.grams)} />
          <Figure
            label={words.amount}
            value={formatMoney(totals.amountPoisha)}
          />
        </Figures>
      )}
      {report.data?.sales.length === 0 ? (
        <p className="text-sm text-muted-foreground">{words.none}</p>
      ) : (
        <DataTable<ScrapSale>
          rows={report.data?.sales ?? []}
          rowKey={(sale) => sale.id}
          columns={[
            { header: words.date, cell: (sale) => formatDay(sale.soldOn) },
            { header: words.buyer, cell: (sale) => sale.buyerName },
            {
              header: words.weight,
              numeric: true,
              cell: (sale) =>
                formatWeight(
                  sale.lines.reduce((sum, line) => sum + line.grams, 0),
                ),
            },
            {
              header: words.amount,
              numeric: true,
              cell: (sale) => formatMoney(sale.amountPoisha),
            },
            {
              header: text.masterData.status,
              cell: (sale) =>
                sale.reversedAt ? (
                  text.scrap.reversed
                ) : (
                  <ReverseSale sale={sale} />
                ),
            },
          ]}
        />
      )}
    </section>
  );
}

function ReverseSale({ sale }: { sale: ScrapSale }) {
  const write = useWrite('scrap', 'stock');
  return (
    <ReasonButton
      label={text.scrap.reverse}
      question={words.confirmReverseSale(sale.buyerName)}
      reasonLabel={text.scrap.reverseReason}
      onConfirm={async (reason) => {
        await unwrap(
          api.POST('/scrap/sales/{id}/reverse', {
            params: { path: { id: sale.id } },
            body: { reason },
            headers: write.headers,
          }),
        );
        await write.done();
      }}
    />
  );
}

function WasteReport({
  range,
  group = 'machine',
  onGroup,
}: {
  range: Range;
  group?: WasteReportGroup;
  onGroup: (group: string) => void;
}) {
  const query = { ...range, groupBy: group };
  const report = useQuery({
    queryKey: ['production', 'waste-report', query],
    queryFn: () =>
      unwrap(api.GET('/production/waste-report', { params: { query } })),
    placeholderData: keepPreviousData,
  });
  const weight = (pick: (row: WasteReportRow) => number) => ({
    numeric: true,
    cell: (row: WasteReportRow) => formatWeight(pick(row)),
  });
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{words.waste}</h2>
        <select
          aria-label={words.groupBy}
          className={filterClass}
          value={group}
          onChange={(event) => onGroup(event.target.value)}
        >
          {GROUPS.map((option) => (
            <option key={option} value={option}>
              {words.groups[option]}
            </option>
          ))}
        </select>
      </div>
      <ErrorMessage message={report.error?.message} />
      {report.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{words.none}</p>
      ) : (
        <DataTable<WasteReportRow>
          rows={report.data ?? []}
          rowKey={(row) => row.key}
          columns={[
            { header: words.groups[group], cell: (row) => row.label },
            { header: words.runner, ...weight((row) => row.runnerGrams) },
            { header: words.reject, ...weight((row) => row.rejectGrams) },
            { header: words.purge, ...weight((row) => row.purgeGrams) },
            { header: words.sweepings, ...weight((row) => row.sweepingsGrams) },
            { header: words.totalWaste, ...weight((row) => row.wasteGrams) },
            {
              header: words.materialUsed,
              ...weight((row) => row.materialUsedGrams),
            },
            {
              header: words.wastePercent,
              numeric: true,
              cell: (row) =>
                row.wasteBasisPoints === null
                  ? ''
                  : formatPercent(row.wasteBasisPoints),
            },
          ]}
        />
      )}
    </section>
  );
}

function Figures({ children }: { children: ReactNode }) {
  return <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">{children}</dl>;
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

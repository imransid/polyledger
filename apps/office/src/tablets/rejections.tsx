import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { Rejection, RejectionStatus } from '@/api/types';
import { DataTable } from '@/components/data-table';
import { ErrorMessage } from '@/components/message';
import { Pager } from '@/components/pager';
import { ReasonButton } from '@/components/reason-button';
import { Button } from '@/components/ui/button';
import { useUrlFilters } from '@/components/use-url-filters';
import { text } from '@/i18n';
import {
  formatCount,
  formatDay,
  formatMoment,
  formatWeight,
} from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import { prefillFrom, tabletRecord } from '@/production/prefill';

const words = text.tablets.rejections;
const PAGE_SIZE = 25;
const STATUSES = Object.keys(words.statuses) as RejectionStatus[];

// Waiting ones first: what a supervisor still has to settle.
export function RejectionsPage() {
  const filters = useUrlFilters();
  const shown = filters.value('status', 'REJECTED');
  const query = {
    status: STATUSES.find((status) => status === shown),
    page: filters.page,
    pageSize: PAGE_SIZE,
  };
  const rejections = useQuery({
    queryKey: ['sync-rejections', query],
    queryFn: () => unwrap(api.GET('/sync/rejections', { params: { query } })),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="grid gap-4">
      <select
        aria-label={words.show}
        className="h-9 max-w-xs rounded-md border border-input bg-transparent px-3 text-sm"
        value={shown}
        onChange={(event) => filters.change('status', event.target.value)}
      >
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {words.statuses[status]}
          </option>
        ))}
        <option value="">{words.all}</option>
      </select>
      <ErrorMessage message={rejections.error?.message} />
      {rejections.data?.total === 0 ? (
        <p className="text-muted-foreground">{words.none}</p>
      ) : (
        <DataTable<Rejection>
          rows={rejections.data?.items ?? []}
          rowKey={(rejection) => rejection.id}
          columns={[
            {
              header: words.received,
              cell: (rejection) => (
                <span className="grid">
                  <span>{formatMoment(rejection.receivedAt)}</span>
                  {rejection.deviceRecordedAt && (
                    <span className="text-xs text-muted-foreground">
                      {words.tabletClock(
                        formatMoment(rejection.deviceRecordedAt),
                      )}
                    </span>
                  )}
                </span>
              ),
            },
            { header: words.tablet, cell: (rejection) => rejection.deviceName },
            {
              header: words.recordedBy,
              cell: (rejection) => rejection.recordedByName ?? '–',
            },
            {
              header: words.jobCard,
              cell: (rejection) =>
                rejection.jobCardId && (
                  <Link
                    to={`/production/${rejection.jobCardId}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {rejection.jobCardNumber ?? '–'}
                  </Link>
                ),
            },
            { header: words.record, cell: summary },
            {
              header: words.reason,
              cell: (rejection) => (
                <span className="text-destructive">{rejection.reason}</span>
              ),
            },
            {
              header: '',
              cell: (rejection) =>
                rejection.status === 'REJECTED' ? (
                  <RejectionActions rejection={rejection} />
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {words.reviewed(
                      rejection.reviewedByName ?? '',
                      rejection.reviewNote ?? '',
                    )}
                  </span>
                ),
            },
          ]}
        />
      )}
      <Pager
        page={filters.page}
        pages={Math.max(
          1,
          Math.ceil((rejections.data?.total ?? 0) / PAGE_SIZE),
        )}
        onPage={(page) => filters.change('page', String(page))}
      />
    </div>
  );
}

function summary(rejection: Rejection) {
  const record = tabletRecord(rejection);
  if (!record) {
    return words.unreadable;
  }
  if (record.kind === 'PRODUCTION_ENTRY') {
    const { entry } = record;
    return words.production(
      entry.shift,
      formatDay(entry.shift_date),
      formatCount(entry.good_pieces),
      formatCount(entry.rejected_pieces),
    );
  }
  const { waste } = record;
  return words.waste(
    waste.shift,
    formatDay(waste.shift_date),
    formatWeight(
      waste.runner_grams +
        waste.reject_grams +
        waste.purge_grams +
        waste.sweepings_grams,
    ),
  );
}

function RejectionActions({ rejection }: { rejection: Rejection }) {
  const write = useWrite('sync-rejections');
  const prefill = prefillFrom(rejection);
  const review = (outcome: 'resolve' | 'dismiss') => async (note: string) => {
    await unwrap(
      api.POST(`/sync/rejections/{id}/${outcome}`, {
        params: { path: { id: rejection.id } },
        body: { note },
        headers: write.headers,
      }),
    );
    await write.done();
  };
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {prefill && rejection.jobCardId && (
        <Button variant="outline" size="sm" asChild>
          <Link
            to={`/production/${rejection.jobCardId}?tab=shifts`}
            state={{ prefill }}
          >
            {words.recordInOffice}
          </Link>
        </Button>
      )}
      <ReasonButton
        label={words.resolve}
        question={words.confirmResolve}
        reasonLabel={words.note}
        onConfirm={review('resolve')}
      />
      <ReasonButton
        label={words.dismiss}
        question={words.confirmDismiss}
        reasonLabel={words.note}
        onConfirm={review('dismiss')}
      />
    </div>
  );
}

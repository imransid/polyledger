import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllMachines, useAllMoulds, useAllProducts } from '@/api/lookups';
import type {
  CardSummary,
  JobCard,
  JobCardDetails,
  Role,
  StockDocumentSummary,
} from '@/api/types';
import {
  ENTRY_RECORDERS,
  FLOOR_LEADS,
  JOB_PLANNERS,
  PRODUCTION_READERS,
  SALES_READERS,
  STORE_STAFF,
} from '@/auth/permissions';
import { useUser } from '@/auth/use-session';
import { ConfirmButton } from '@/components/confirm-button';
import { DataTable } from '@/components/data-table';
import { DocumentLink } from '@/components/document-link';
import { ErrorMessage } from '@/components/message';
import { ReasonButton } from '@/components/reason-button';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { Button } from '@/components/ui/button';
import { useUrlFilters } from '@/components/use-url-filters';
import { text } from '@/i18n';
import {
  formatDay,
  formatGrams,
  formatMoment,
  formatPercent,
  formatPieces,
  formatWeight,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { useWrite } from '@/lib/use-write';
import { GoodsTab } from './goods-tab';
import { MaterialTab } from './material-tab';
import { canClose } from './close-rule';
import { JobCardStatusBadge } from './parts';
import { ShiftsTab } from './shifts-tab';
import { useCardEntries, useCardSummary } from './use-job-card';

const words = text.production;

type Tab = 'overview' | 'material' | 'shifts' | 'goods';

// Each role sees the tabs it works in: the store its material and goods,
// the floor its shifts, operators only what they record.
const TABS: { tab: Tab; roles: Role[] }[] = [
  { tab: 'overview', roles: [...PRODUCTION_READERS, 'OPERATOR'] },
  { tab: 'material', roles: PRODUCTION_READERS },
  { tab: 'shifts', roles: [...PRODUCTION_READERS, ...ENTRY_RECORDERS] },
  { tab: 'goods', roles: STORE_STAFF },
];

export function JobCardPage() {
  const { id = '' } = useParams();
  const card = useQuery({
    queryKey: ['job-cards', 'record', id],
    queryFn: () =>
      unwrap(api.GET('/job-cards/{id}', { params: { path: { id } } })),
  });
  if (!card.data) {
    return <RecordPending error={card.error} />;
  }
  return <JobCardView card={card.data} />;
}

function JobCardView({ card }: { card: JobCardDetails }) {
  const { role } = useUser();
  const filters = useUrlFilters();
  const products = useAllProducts();
  const moulds = useAllMoulds();
  const machines = useAllMachines();
  const tabs = TABS.filter(({ roles }) => roles.includes(role)).map(
    ({ tab }) => tab,
  );
  const tab = tabs.find((t) => t === filters.value('tab')) ?? tabs[0];
  const product = products.data?.find((p) => p.id === card.productId);

  return (
    <RecordShell
      title={`${card.number} · ${product?.code ?? ''}`}
      badge={<JobCardStatusBadge status={card.status} />}
      actions={<CardActions card={card} />}
    >
      <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
        <dt className="text-muted-foreground">{words.product}</dt>
        <dd>{product ? `${product.code} · ${product.name}` : ''}</dd>
        <dt className="text-muted-foreground">{words.mould}</dt>
        <dd>
          {moulds.data?.find((m) => m.id === card.mouldId)?.code} ·{' '}
          {card.cavities} × {formatGrams(card.pieceWeightMg)},{' '}
          {formatGrams(card.runnerWeightMg)}
        </dd>
        <dt className="text-muted-foreground">{words.machine}</dt>
        <dd>{machines.data?.find((m) => m.id === card.machineId)?.code}</dd>
        <dt className="text-muted-foreground">{words.plannedPieces}</dt>
        <dd>
          {formatPieces(card.plannedPieces)} ·{' '}
          {formatDay(card.plannedStartDate)}
        </dd>
        {card.salesOrderId && (
          <>
            <dt className="text-muted-foreground">{words.salesOrder}</dt>
            <dd>
              {SALES_READERS.includes(role) ? (
                <Link
                  to={`/orders/${card.salesOrderId}`}
                  className="underline-offset-4 hover:underline"
                >
                  {card.salesOrderNumber}
                </Link>
              ) : (
                card.salesOrderNumber
              )}
            </dd>
          </>
        )}
      </dl>
      <nav className="flex gap-1 border-b" aria-label={words.number}>
        {tabs.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => filters.change('tab', name)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm',
              name === tab
                ? 'border-primary font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {words.cardTabs[name]}
          </button>
        ))}
      </nav>
      {tab === 'overview' && PRODUCTION_READERS.includes(role) && (
        <Overview card={card} />
      )}
      {tab === 'material' && <MaterialTab card={card} />}
      {tab === 'shifts' && <ShiftsTab card={card} />}
      {tab === 'goods' && <GoodsTab card={card} />}
    </RecordShell>
  );
}

function CardActions({ card }: { card: JobCard }) {
  const { role } = useUser();
  const write = useWrite('job-cards', 'production');
  const options = { params: { path: { id: card.id } }, headers: write.headers };
  const step = async (call: Promise<unknown>) => {
    await call;
    await write.done();
  };
  const plans = JOB_PLANNERS.includes(role);
  const leads = FLOOR_LEADS.includes(role);
  const inWork = card.status === 'RELEASED' || card.status === 'RUNNING';
  const closable = useClosable(card, plans && inWork);
  return (
    <>
      {plans && card.status === 'PLANNED' && (
        <Button
          size="sm"
          onClick={() =>
            void step(unwrap(api.POST('/job-cards/{id}/release', options)))
          }
        >
          {words.actions.release}
        </Button>
      )}
      {leads && card.status === 'RELEASED' && (
        <Button
          size="sm"
          onClick={() =>
            void step(unwrap(api.POST('/job-cards/{id}/start', options)))
          }
        >
          {words.actions.start}
        </Button>
      )}
      {leads && card.status === 'RUNNING' && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            void step(unwrap(api.POST('/job-cards/{id}/stop', options)))
          }
        >
          {words.actions.stop}
        </Button>
      )}
      {closable && (
        <ConfirmButton
          label={words.actions.close}
          question={words.confirmClose(card.number)}
          onConfirm={() =>
            step(unwrap(api.POST('/job-cards/{id}/close', options)))
          }
        />
      )}
      {plans && (card.status === 'PLANNED' || card.status === 'RELEASED') && (
        <ReasonButton
          label={words.actions.cancel}
          question={words.confirmCancel(card.number)}
          reasonLabel={text.orders.reason}
          onConfirm={(reason) =>
            step(
              unwrap(
                api.POST('/job-cards/{id}/cancel', {
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

function useClosable(card: JobCard, asked: boolean): boolean {
  const entries = useCardEntries(card.id, asked);
  const summary = useCardSummary(card.id, asked);
  return (
    asked &&
    entries.data !== undefined &&
    summary.data !== undefined &&
    canClose(entries.data, summary.data.materials)
  );
}

function Overview({ card }: { card: JobCard }) {
  const summary = useCardSummary(card.id);
  return (
    <div className="grid gap-6">
      <ErrorMessage message={summary.error?.message} />
      {summary.data && <SummaryView summary={summary.data} />}
      <CardDocuments cardId={card.id} />
    </div>
  );
}

/** What became of every gram issued to the card, and how many pieces failed. */
export function SummaryView({ summary }: { summary: CardSummary }) {
  const s = words.summary;
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-5">
        {[
          [words.plannedPieces, formatPieces(summary.plannedPieces)],
          [s.good, formatPieces(summary.goodPieces)],
          [s.rejected, formatPieces(summary.rejectedPieces)],
          [s.rejectRate, formatPercent(summary.rejectBasisPoints)],
          [s.onFloor, formatPieces(summary.piecesOnFloor)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <DataTable
        rows={summary.materials}
        rowKey={(material) => material.rawMaterialId}
        columns={[
          { header: s.material, cell: (m) => m.code },
          {
            header: s.issued,
            numeric: true,
            cell: (m) => formatWeight(m.issuedGrams),
          },
          {
            header: s.forPieces,
            numeric: true,
            cell: (m) => formatWeight(m.usedForPiecesGrams),
          },
          {
            header: s.forRunners,
            numeric: true,
            cell: (m) => formatWeight(m.usedForRunnersGrams),
          },
          {
            header: s.purge,
            numeric: true,
            cell: (m) => formatWeight(m.usedForPurgeAndSweepingsGrams),
          },
          {
            header: s.returnedToStore,
            numeric: true,
            cell: (m) => formatWeight(m.returnedGrams),
          },
          {
            header: s.difference,
            numeric: true,
            // Issued but neither used nor returned: worth asking about.
            cell: (m) => (
              <span
                className={
                  m.differenceGrams !== 0
                    ? 'font-medium text-destructive'
                    : undefined
                }
              >
                {formatWeight(m.differenceGrams)}
              </span>
            ),
          },
        ]}
      />
      <dl className="grid grid-cols-3 gap-x-6 text-sm">
        {[
          [s.expectedWaste, summary.waste.expectedRejectAndRunnerGrams],
          [s.weighedWaste, summary.waste.weighedRejectAndRunnerGrams],
          [s.wasteDifference, summary.waste.differenceGrams],
        ].map(([label, grams]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">
              {formatWeight(Number(grams))}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CardDocuments({ cardId }: { cardId: string }) {
  const documents = useQuery({
    queryKey: ['stock', 'documents', { jobCardId: cardId }],
    queryFn: () =>
      unwrap(
        api.GET('/stock/documents', {
          params: { query: { jobCardId: cardId, page: 1, pageSize: 200 } },
        }),
      ),
  });
  if (!documents.data || documents.data.total === 0) {
    return null;
  }
  return (
    <section className="grid gap-2">
      <h2 className="font-semibold">{words.documents}</h2>
      <DataTable<StockDocumentSummary>
        rows={documents.data.items}
        rowKey={(document) => document.id}
        columns={[
          {
            header: text.stock.documents.number,
            cell: (document) => <DocumentLink {...document} />,
          },
          {
            header: text.stock.documents.kind,
            cell: (document) => text.stock.kinds[document.kind],
          },
          {
            header: text.stock.documents.posted,
            cell: (document) => formatMoment(document.postedAt),
          },
          {
            header: text.stock.documents.by,
            cell: (document) => document.postedByName,
          },
        ]}
      />
    </section>
  );
}

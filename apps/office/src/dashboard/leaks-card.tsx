import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { LeakFigures } from '@/api/types';
import { DataTable } from '@/components/data-table';
import { text } from '@/i18n';
import {
  formatChange,
  formatDay,
  formatPercentChange,
  formatWeight,
} from '@/lib/format';
import { DashboardCard, Figure } from './parts';
import { WasteChart } from './waste-chart';

const words = text.dashboard.leaks;

type WorstJobCard = LeakFigures['worstJobCards'][number];

export function LeaksCard({ className }: { className?: string }) {
  const leaks = useQuery({
    queryKey: ['dashboard', 'leaks'],
    queryFn: () => unwrap(api.GET('/dashboard/leaks')),
  });
  return (
    <DashboardCard title={words.title} query={leaks} className={className}>
      {(figures) => {
        const range = `from=${figures.from}&to=${figures.to}`;
        return (
          <>
            <p className="px-2 text-sm text-muted-foreground">
              {words.range(formatDay(figures.from), formatDay(figures.to))}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <Figure
                value={formatChange('RAW_MATERIAL', figures.differenceGrams)}
                label={words.unexplained(figures.closedJobCards)}
                tone={figures.differenceGrams !== 0 ? 'warning' : undefined}
              />
              <Figure
                to={`/stock/shortages?${range}`}
                value={formatWeight(figures.shortageGrams)}
                label={words.shortages}
              />
              <Figure
                to={`/scrap/reports?${range}`}
                value={formatWeight(figures.grindingLossGrams)}
                label={words.grindingLoss}
              />
            </div>
            {figures.worstJobCards.length > 0 && (
              <section className="grid gap-1">
                <h3 className="px-2 text-sm font-medium">{words.worst}</h3>
                <DataTable<WorstJobCard>
                  rows={figures.worstJobCards}
                  rowKey={(card) => card.jobCardId}
                  columns={[
                    {
                      header: words.jobCard,
                      cell: (card) => (
                        <Link
                          to={`/production/${card.jobCardId}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {card.number}
                        </Link>
                      ),
                    },
                    { header: words.product, cell: (card) => card.productCode },
                    {
                      header: words.issued,
                      numeric: true,
                      cell: (card) => formatWeight(card.issuedGrams),
                    },
                    {
                      header: words.difference,
                      numeric: true,
                      cell: (card) =>
                        formatChange('RAW_MATERIAL', card.differenceGrams),
                    },
                    {
                      header: words.ofIssued,
                      numeric: true,
                      cell: (card) =>
                        card.differenceBasisPoints === null
                          ? '–'
                          : formatPercentChange(card.differenceBasisPoints),
                    },
                  ]}
                />
              </section>
            )}
            <section className="grid gap-2">
              <h3 className="px-2 text-sm font-medium">
                <Link
                  to={`/scrap/reports?${range}&group=day`}
                  className="underline-offset-4 hover:underline"
                >
                  {words.wasteByDay}
                </Link>
              </h3>
              <WasteChart days={figures.wasteByDay} />
            </section>
          </>
        );
      }}
    </DashboardCard>
  );
}

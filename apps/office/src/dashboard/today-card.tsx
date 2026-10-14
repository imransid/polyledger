import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { text } from '@/i18n';
import { formatPercent, formatPieces } from '@/lib/format';
import { DashboardCard, Figure } from './parts';

const words = text.dashboard.todayCard;
const states = text.production.board.states;
const BOARD = '/production/board';

export function TodayCard() {
  const today = useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: () => unwrap(api.GET('/dashboard/today')),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  return (
    <DashboardCard title={words.title} query={today}>
      {(figures) => (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Figure
              to={BOARD}
              value={formatPieces(figures.goodPieces)}
              label={words.good}
            />
            <Figure
              to={BOARD}
              value={
                figures.rejectBasisPoints === null
                  ? '–'
                  : formatPercent(figures.rejectBasisPoints)
              }
              label={words.rejects}
            />
          </div>
          <div>
            <h3 className="px-2 text-sm font-medium">{words.machines}</h3>
            <div className="grid grid-cols-3 gap-2">
              <Figure
                to={BOARD}
                value={String(figures.machines.running)}
                label={states.RUNNING}
              />
              <Figure
                to={BOARD}
                value={String(figures.machines.idle)}
                label={states.IDLE}
              />
              <Figure
                to={BOARD}
                value={String(figures.machines.repair)}
                label={states.REPAIR}
                tone={figures.machines.repair > 0 ? 'warning' : undefined}
              />
            </div>
          </div>
        </>
      )}
    </DashboardCard>
  );
}

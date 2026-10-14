import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { MachineOnBoard } from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { text } from '@/i18n';
import { formatPercent, formatPieces } from '@/lib/format';
import { cn } from '@/lib/utils';

const words = text.production.board;

const STATE_STYLE: Record<MachineOnBoard['state'], string> = {
  RUNNING: 'border-green-600 bg-green-50',
  IDLE: 'border-muted-foreground/30 bg-muted/40',
  REPAIR: 'border-amber-500 bg-amber-50',
};

const STATE_BADGE: Record<MachineOnBoard['state'], string> = {
  RUNNING: 'bg-green-600 text-white',
  IDLE: 'bg-muted-foreground/60 text-white',
  REPAIR: 'bg-amber-500 text-white',
};

// Every minute while someone is looking: TanStack Query stops the timer
// while the tab is hidden and refreshes when it comes back.
export function MachineBoard() {
  const board = useQuery({
    queryKey: ['production', 'machine-board'],
    queryFn: () => unwrap(api.GET('/production/machine-board')),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  if (board.data?.length === 0) {
    return <p className="text-muted-foreground">{words.empty}</p>;
  }
  return (
    <div className="grid gap-4">
      <ErrorMessage message={board.error?.message} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {board.data?.map((machine) => (
          <MachineCard key={machine.machineId} machine={machine} />
        ))}
      </div>
    </div>
  );
}

function MachineCard({ machine }: { machine: MachineOnBoard }) {
  const made = machine.goodPiecesToday + machine.rejectedPiecesToday;
  return (
    <article
      aria-label={machine.code}
      className={cn(
        'grid gap-2 rounded-lg border-2 p-4',
        STATE_STYLE[machine.state],
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">
          {machine.code}{' '}
          <span className="font-normal text-muted-foreground">
            {machine.name}
          </span>
        </h2>
        <span
          className={cn(
            'rounded px-2 py-0.5 text-xs font-medium',
            STATE_BADGE[machine.state],
          )}
        >
          {words.states[machine.state]}
        </span>
      </header>
      {machine.jobCard && (
        <p className="text-sm">
          <Link
            to={`/production/${machine.jobCard.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {machine.jobCard.number}
          </Link>{' '}
          · {machine.jobCard.productCode}
        </p>
      )}
      <p className="text-sm tabular-nums">
        {made === 0 ? (
          <span className="text-muted-foreground">{words.nothingToday}</span>
        ) : (
          <>
            {words.today}:{' '}
            {words.goodToday(formatPieces(machine.goodPiecesToday))},{' '}
            {words.rejectToday(
              formatPercent(machine.rejectBasisPointsToday ?? 0),
            )}
          </>
        )}
      </p>
    </article>
  );
}

import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { text } from '@/i18n';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DashboardCard, Figure } from './parts';

const words = text.dashboard.gate;

export function GateCard() {
  const gate = useQuery({
    queryKey: ['dashboard', 'gate'],
    queryFn: () => unwrap(api.GET('/dashboard/gate')),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  return (
    <DashboardCard title={words.title} query={gate}>
      {(waiting) => (
        <>
          <Figure
            to="/gate"
            value={String(waiting.length)}
            label={words.waiting}
            tone={
              waiting.some((challan) => challan.waitedTooLong)
                ? 'warning'
                : undefined
            }
          />
          {waiting.length > 0 && (
            <ul className="grid gap-1 text-sm">
              {waiting.map((challan) => (
                <li
                  key={challan.id}
                  className={cn(
                    'rounded-md border px-2 py-1',
                    challan.waitedTooLong
                      ? 'border-amber-300 bg-amber-50 text-amber-900'
                      : 'border-transparent',
                  )}
                >
                  <Link
                    to={`/dispatch/${challan.id}`}
                    className="flex flex-wrap justify-between gap-x-3 underline-offset-4 hover:underline"
                  >
                    <span>
                      <span className="font-medium">{challan.number}</span> ·{' '}
                      {challan.customerCode} · {challan.vehicleNumber}
                    </span>
                    <span>
                      {words.waited(
                        formatDuration(challan.waitingMinutes * 60),
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </DashboardCard>
  );
}

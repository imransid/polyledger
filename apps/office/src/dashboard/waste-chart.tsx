import type { LeakFigures } from '@/api/types';
import { text } from '@/i18n';
import { formatDayOfMonth, formatPercent } from '@/lib/format';

/** One bar per day, scaled to the worst day; a day without production has none. */
export function WasteChart({ days }: { days: LeakFigures['wasteByDay'] }) {
  const worst = Math.max(1, ...days.map((day) => day.wasteBasisPoints ?? 0));
  return (
    <ol
      aria-label={text.dashboard.leaks.wasteByDay}
      className="flex items-end gap-2"
    >
      {days.map((day) => (
        <li
          key={day.day}
          aria-label={formatDayOfMonth(day.day)}
          className="grid flex-1 justify-items-center gap-1 text-xs"
        >
          <span className="tabular-nums">
            {day.wasteBasisPoints === null
              ? '–'
              : formatPercent(day.wasteBasisPoints)}
          </span>
          <div className="flex h-24 w-full items-end">
            <div
              className="w-full rounded-t bg-primary/80"
              style={{
                height: `${((day.wasteBasisPoints ?? 0) / worst) * 100}%`,
              }}
            />
          </div>
          <span className="text-muted-foreground">
            {formatDayOfMonth(day.day)}
          </span>
        </li>
      ))}
    </ol>
  );
}

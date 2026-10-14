import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ErrorMessage } from '@/components/message';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { text } from '@/i18n';
import { cn } from '@/lib/utils';

interface DashboardCardProps<T> {
  title: string;
  query: UseQueryResult<T, Error>;
  className?: string;
  children: (figures: T) => ReactNode;
}

/** Loads, fails and shows on its own, so one slow card holds up no other. */
export function DashboardCard<T>({
  title,
  query,
  className,
  children,
}: DashboardCardProps<T>) {
  return (
    <Card role="region" aria-label={title} className={className}>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {query.data !== undefined ? (
          children(query.data)
        ) : query.error ? (
          <ErrorMessage message={query.error.message} />
        ) : (
          <p className="text-sm text-muted-foreground">{text.loading}</p>
        )}
      </CardContent>
    </Card>
  );
}

interface FigureProps {
  /** The screen that explains the number; left out when none lists it. */
  to?: string;
  value: string;
  label: string;
  /** Red for something overdue, amber for something to look at. */
  tone?: 'danger' | 'warning';
}

export function Figure({ to, value, label, tone }: FigureProps) {
  const figure = (
    <>
      <span
        className={cn(
          'text-2xl font-semibold tabular-nums',
          tone === 'danger' && 'text-destructive',
          tone === 'warning' && 'text-amber-700',
        )}
      >
        {value}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </>
  );
  if (!to) {
    return <div className="grid p-2">{figure}</div>;
  }
  return (
    <Link
      to={to}
      className="grid rounded-md p-2 underline-offset-4 hover:bg-accent hover:underline"
    >
      {figure}
    </Link>
  );
}

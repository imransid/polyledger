import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ErrorMessage } from '@/components/message';
import { text } from '@/i18n';

interface RecordShellProps {
  title: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function RecordShell({
  title,
  badge,
  actions,
  children,
}: RecordShellProps) {
  return (
    <div className="grid max-w-2xl gap-6">
      <Link
        to=".."
        relative="path"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {text.record.back}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{title}</h1>
          {badge}
        </div>
        <div className="flex gap-2">{actions}</div>
      </div>
      {children}
    </div>
  );
}

/** Loading or failing to load a record that should exist. */
export function RecordPending({ error }: { error: Error | null }) {
  return error ? (
    <ErrorMessage message={error.message} />
  ) : (
    <p className="text-muted-foreground">{text.loading}</p>
  );
}

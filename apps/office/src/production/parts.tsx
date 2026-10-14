import type { JobCardStatus } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { text } from '@/i18n';

export function JobCardStatusBadge({ status }: { status: JobCardStatus }) {
  const working = status === 'RELEASED' || status === 'RUNNING';
  return (
    <Badge variant={working ? 'default' : 'secondary'}>
      {text.production.statuses[status]}
    </Badge>
  );
}

/** Amber: worth a supervisor's look, but nothing was refused. */
export function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) {
    return null;
  }
  return (
    <ul className="grid gap-1 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
      {warnings.map((warning) => (
        <li key={warning}>{warning}</li>
      ))}
    </ul>
  );
}

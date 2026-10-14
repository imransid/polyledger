import type { SalesOrderStatus } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { text } from '@/i18n';

const words = text.orders;

export function OrderStatusBadge({ status }: { status: SalesOrderStatus }) {
  const open = status === 'CONFIRMED' || status === 'IN_PRODUCTION';
  return (
    <Badge variant={open ? 'default' : 'secondary'}>
      {words.statuses[status]}
    </Badge>
  );
}

export function LateBadge() {
  return <Badge variant="destructive">{words.late}</Badge>;
}

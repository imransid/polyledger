import type { Challan } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { text } from '@/i18n';

const words = text.dispatch;

export function ChallanStatusBadge({
  challan,
}: {
  challan: Pick<Challan, 'gatePassStatus' | 'reversedAt'>;
}) {
  if (challan.reversedAt) {
    return <Badge variant="secondary">{words.reversed}</Badge>;
  }
  return (
    <Badge
      variant={challan.gatePassStatus === 'PASSED' ? 'default' : 'outline'}
    >
      {words.gatePassStatuses[challan.gatePassStatus]}
    </Badge>
  );
}

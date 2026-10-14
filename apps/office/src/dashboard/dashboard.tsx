import { text } from '@/i18n';
import { factoryToday } from '@/lib/dates';
import { formatDay } from '@/lib/format';
import { GateCard } from './gate-card';
import { LeaksCard } from './leaks-card';
import { OrdersCard } from './orders-card';
import { StockCard } from './stock-card';
import { TodayCard } from './today-card';

/** The owner's and manager's home page: read-only, every number a link. */
export function Dashboard() {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">{text.dashboard.title}</h1>
        <p className="text-sm text-muted-foreground">
          {text.dashboard.today(formatDay(factoryToday()))}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TodayCard />
        <OrdersCard />
        <GateCard />
        <StockCard />
        <LeaksCard className="md:col-span-2" />
      </div>
    </div>
  );
}

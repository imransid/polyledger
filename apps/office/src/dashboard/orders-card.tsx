import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { SalesOrderStatus } from '@/api/types';
import { CustomerName } from '@/components/customer-name';
import { text } from '@/i18n';
import { formatDay } from '@/lib/format';
import { DashboardCard, Figure } from './parts';

const words = text.dashboard.orders;

export function OrdersCard() {
  const orders = useQuery({
    queryKey: ['dashboard', 'orders'],
    queryFn: () => unwrap(api.GET('/dashboard/orders')),
  });
  return (
    <DashboardCard title={words.title} query={orders}>
      {(figures) => {
        const statuses = Object.entries(figures.open) as [
          SalesOrderStatus,
          number,
        ][];
        const openCount = statuses.reduce((sum, [, count]) => sum + count, 0);
        return (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Figure
                to="/orders?open=true"
                value={String(openCount)}
                label={words.open}
              />
              <Figure
                to="/orders?late=true"
                value={String(figures.lateCount)}
                label={words.late}
                tone={figures.lateCount > 0 ? 'danger' : undefined}
              />
              <Figure
                to={`/orders?open=true&from=${figures.today}&to=${figures.dueBy}`}
                value={String(figures.dueCount)}
                label={words.due}
              />
            </div>
            <p className="flex flex-wrap gap-x-3 px-2 text-sm text-muted-foreground">
              {statuses.map(([status, count]) => (
                <Link
                  key={status}
                  to={`/orders?status=${status}`}
                  className="underline-offset-4 hover:underline"
                >
                  {count} {text.orders.statuses[status].toLowerCase()}
                </Link>
              ))}
            </p>
            {figures.mostLate.length > 0 && (
              <ul className="grid gap-1 px-2 text-sm">
                {figures.mostLate.map((order) => (
                  <li key={order.id}>
                    <Link
                      to={`/orders/${order.id}`}
                      className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 text-destructive underline-offset-4 hover:underline"
                    >
                      <span className="font-medium">{order.number}</span>
                      <CustomerName
                        name={order.customerName}
                        code={order.customerCode}
                      />
                      <span className="text-right">
                        {formatDay(order.deliveryDate)}
                        <span className="block">
                          {words.daysLate(order.daysLate)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      }}
    </DashboardCard>
  );
}

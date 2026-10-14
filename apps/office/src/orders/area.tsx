import { NavLink, Route, Routes } from 'react-router';
import { RoleGate } from '@/auth/require-session';
import { SALES_EDITORS } from '@/auth/permissions';
import { text } from '@/i18n';
import { cn } from '@/lib/utils';
import { NotFoundPage } from '@/pages/not-found-page';
import { BuyList } from './buy-list';
import { EditOrderPage, NewOrderPage } from './order-form';
import { OrderList } from './order-list';
import { OrderPage } from './order-page';

const TABS = [
  { path: '.', label: text.orders.tabs.orders },
  { path: 'buy-list', label: text.orders.tabs.buyList },
];

export function OrdersArea() {
  return (
    <div className="grid gap-6">
      <nav className="flex gap-1 border-b">
        {TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end
            className={({ isActive }) =>
              cn(
                '-mb-px border-b-2 px-3 py-2 text-sm',
                isActive
                  ? 'border-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<OrderList />} />
        <Route path="buy-list" element={<BuyList />} />
        <Route
          path="new"
          element={
            <RoleGate roles={SALES_EDITORS}>
              <NewOrderPage />
            </RoleGate>
          }
        />
        <Route path=":id" element={<OrderPage />} />
        <Route
          path=":id/edit"
          element={
            <RoleGate roles={SALES_EDITORS}>
              <EditOrderPage />
            </RoleGate>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

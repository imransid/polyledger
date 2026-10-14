import type { ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes } from 'react-router';
import type { Role } from '@/api/types';
import { STOCK_MANAGERS, STORE_STAFF } from '@/auth/permissions';
import { RoleGate } from '@/auth/require-session';
import { useUser } from '@/auth/use-session';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { cn } from '@/lib/utils';
import { NotFoundPage } from '@/pages/not-found-page';
import { AdjustmentPage } from './adjustment';
import { BalancesPage, StockCardPage } from './balances';
import { DocumentPage, DocumentsPage } from './documents';
import { OpeningPage } from './opening';
import { LowStockPage, ShortagesPage } from './reports';
import { ReceivePage } from './receive';
import { TransferPage } from './transfer';

const words = text.stock;

const TABS = [
  { path: 'balances', label: words.tabs.balances },
  { path: 'documents', label: words.tabs.documents },
  { path: 'low-stock', label: words.tabs.lowStock },
  { path: 'shortages', label: words.tabs.shortages },
];

const ACTIONS = [
  { path: 'receive', label: words.actions.receive, roles: STORE_STAFF },
  { path: 'transfer', label: words.actions.transfer, roles: STORE_STAFF },
  { path: 'opening', label: words.actions.opening, roles: STOCK_MANAGERS },
  { path: 'adjust', label: words.actions.adjust, roles: STOCK_MANAGERS },
];

/** Balances first: the storekeeper's Receive and Transfer are one click away. */
export function StockArea() {
  const { role } = useUser();
  const posting = (roles: Role[], page: ReactNode) => (
    <RoleGate roles={roles}>{page}</RoleGate>
  );
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b">
        <nav className="flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
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
        <div className="flex flex-wrap gap-2 pb-2">
          {ACTIONS.filter((action) => action.roles.includes(role)).map(
            (action) => (
              <Button key={action.path} size="sm" variant="outline" asChild>
                <Link to={action.path}>{action.label}</Link>
              </Button>
            ),
          )}
        </div>
      </div>
      <Routes>
        <Route index element={<Navigate to="balances" replace />} />
        <Route path="balances" element={<BalancesPage />} />
        <Route path="card" element={<StockCardPage />} />
        <Route path="documents" element={<DocumentsPage />} />
        <Route path="documents/:id" element={<DocumentPage />} />
        <Route path="low-stock" element={<LowStockPage />} />
        <Route path="shortages" element={<ShortagesPage />} />
        <Route path="receive" element={posting(STORE_STAFF, <ReceivePage />)} />
        <Route
          path="transfer"
          element={posting(STORE_STAFF, <TransferPage />)}
        />
        <Route
          path="opening"
          element={posting(STOCK_MANAGERS, <OpeningPage />)}
        />
        <Route
          path="adjust"
          element={posting(STOCK_MANAGERS, <AdjustmentPage />)}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

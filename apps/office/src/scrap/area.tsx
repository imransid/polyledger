import { NavLink, Route, Routes } from 'react-router';
import type { Role } from '@/api/types';
import { SCRAP_MANAGERS } from '@/auth/permissions';
import { RoleGate } from '@/auth/require-session';
import { useUser } from '@/auth/use-session';
import { text } from '@/i18n';
import { cn } from '@/lib/utils';
import { NotFoundPage } from '@/pages/not-found-page';
import { GrindingPage } from './grinding';
import { ScrapReports } from './reports';
import { ScrapProductsPage } from './scrap-products';
import { ScrapSalePage } from './scrap-sale';

const words = text.scrap;

// Everyone in the area grinds and reads the reports; only those who may see
// money scrap products and sell scrap.
const TABS: { path: string; label: string; roles?: Role[] }[] = [
  { path: '.', label: words.tabs.grinding },
  { path: 'products', label: words.tabs.products, roles: SCRAP_MANAGERS },
  { path: 'sale', label: words.tabs.sale, roles: SCRAP_MANAGERS },
  { path: 'reports', label: words.tabs.reports },
];

export function ScrapArea() {
  const role = useUser().role;
  return (
    <div className="grid gap-6">
      <nav className="flex gap-1 border-b">
        {TABS.filter((tab) => !tab.roles || tab.roles.includes(role)).map(
          (tab) => (
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
          ),
        )}
      </nav>
      <Routes>
        <Route index element={<GrindingPage />} />
        <Route
          path="products"
          element={
            <RoleGate roles={SCRAP_MANAGERS}>
              <ScrapProductsPage />
            </RoleGate>
          }
        />
        <Route
          path="sale"
          element={
            <RoleGate roles={SCRAP_MANAGERS}>
              <ScrapSalePage />
            </RoleGate>
          }
        />
        <Route path="reports" element={<ScrapReports />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

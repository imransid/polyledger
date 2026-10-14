import { Navigate, NavLink, Route, Routes } from 'react-router';
import { text } from '@/i18n';
import { cn } from '@/lib/utils';
import { NotFoundPage } from '@/pages/not-found-page';
import { FormulasPage } from './formulas-page';
import { MachineList, MachinePage } from './machines';
import { MouldList, MouldPage } from './moulds';
import { PartnerList, PartnerPage } from './partners';
import { ProductList, ProductPage } from './products';
import { RawMaterialList, RawMaterialPage } from './raw-materials';

const words = text.masterData;

const TABS = [
  { path: 'raw-materials', label: words.rawMaterials.title },
  { path: 'products', label: words.products.title },
  { path: 'moulds', label: words.moulds.title },
  { path: 'machines', label: words.machines.title },
  { path: 'customers', label: words.customers.title },
  { path: 'suppliers', label: words.suppliers.title },
];

/** A record's page is `<area>/<id>`; `<area>/new` creates one. */
export function MasterDataArea() {
  return (
    <div className="grid gap-6">
      <nav className="flex flex-wrap gap-1 border-b">
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
      <Routes>
        <Route index element={<Navigate to="raw-materials" replace />} />
        <Route path="raw-materials" element={<RawMaterialList />} />
        <Route path="raw-materials/:id" element={<RawMaterialPage />} />
        <Route path="products" element={<ProductList />} />
        <Route path="products/:id" element={<ProductPage />} />
        <Route path="products/:id/formulas" element={<FormulasPage />} />
        <Route path="moulds" element={<MouldList />} />
        <Route path="moulds/:id" element={<MouldPage />} />
        <Route path="machines" element={<MachineList />} />
        <Route path="machines/:id" element={<MachinePage />} />
        <Route path="customers" element={<PartnerList kind="customers" />} />
        <Route
          path="customers/:id"
          element={<PartnerPage kind="customers" />}
        />
        <Route path="suppliers" element={<PartnerList kind="suppliers" />} />
        <Route
          path="suppliers/:id"
          element={<PartnerPage kind="suppliers" />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

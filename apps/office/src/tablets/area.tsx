import { Navigate, NavLink, Route, Routes } from 'react-router';
import type { Role } from '@/api/types';
import {
  DEVICE_ADMINS,
  PIN_SETTERS,
  RECORD_REVIEWERS,
} from '@/auth/permissions';
import { RoleGate } from '@/auth/require-session';
import { useUser } from '@/auth/use-session';
import { text } from '@/i18n';
import { cn } from '@/lib/utils';
import { NotFoundPage } from '@/pages/not-found-page';
import { DevicesPage } from './devices';
import { PinsPage } from './pins';
import { RejectionsPage } from './rejections';

const words = text.tablets.tabs;

const TABS: { path: string; label: string; roles: Role[] }[] = [
  { path: 'devices', label: words.devices, roles: DEVICE_ADMINS },
  { path: 'pins', label: words.pins, roles: PIN_SETTERS },
  { path: 'rejections', label: words.rejections, roles: RECORD_REVIEWERS },
];

export function TabletsArea() {
  const role = useUser().role;
  const tabs = TABS.filter((tab) => tab.roles.includes(role));
  return (
    <div className="grid gap-6">
      <nav className="flex gap-1 border-b">
        {tabs.map((tab) => (
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
        <Route index element={<Navigate to={tabs[0].path} replace />} />
        <Route
          path="devices"
          element={
            <RoleGate roles={DEVICE_ADMINS}>
              <DevicesPage />
            </RoleGate>
          }
        />
        <Route
          path="pins"
          element={
            <RoleGate roles={PIN_SETTERS}>
              <PinsPage />
            </RoleGate>
          }
        />
        <Route path="rejections" element={<RejectionsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

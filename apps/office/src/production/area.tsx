import { NavLink, Route, Routes } from 'react-router';
import { JOB_PLANNERS, PRODUCTION_READERS } from '@/auth/permissions';
import { RoleGate } from '@/auth/require-session';
import { useUser } from '@/auth/use-session';
import { text } from '@/i18n';
import { cn } from '@/lib/utils';
import { NotFoundPage } from '@/pages/not-found-page';
import { JobCardList } from './job-card-list';
import { JobCardPage } from './job-card-page';
import { MachineBoard } from './machine-board';
import { NewJobCardPage } from './new-job-card';

export function ProductionArea() {
  const { role } = useUser();
  const tabs = [
    { path: '.', label: text.production.tabs.jobCards, show: true },
    {
      path: 'board',
      label: text.production.tabs.board,
      show: PRODUCTION_READERS.includes(role),
    },
  ].filter((tab) => tab.show);
  return (
    <div className="grid gap-6">
      <nav className="flex gap-1 border-b">
        {tabs.map((tab) => (
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
        <Route index element={<JobCardList />} />
        <Route
          path="board"
          element={
            <RoleGate roles={PRODUCTION_READERS}>
              <MachineBoard />
            </RoleGate>
          }
        />
        <Route
          path="new"
          element={
            <RoleGate roles={JOB_PLANNERS}>
              <NewJobCardPage />
            </RoleGate>
          }
        />
        <Route path=":id" element={<JobCardPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

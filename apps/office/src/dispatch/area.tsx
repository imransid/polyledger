import { Route, Routes } from 'react-router';
import { RoleGate } from '@/auth/require-session';
import { DISPATCH_MANAGERS, DISPATCHERS } from '@/auth/permissions';
import { NotFoundPage } from '@/pages/not-found-page';
import { ChallanList } from './challan-list';
import { ChallanPage } from './challan-page';
import { NewChallanPage } from './new-challan';
import { ReturnPage } from './return-form';

export function DispatchArea() {
  return (
    <Routes>
      <Route index element={<ChallanList />} />
      <Route
        path="new"
        element={
          <RoleGate roles={DISPATCHERS}>
            <NewChallanPage />
          </RoleGate>
        }
      />
      <Route path=":id" element={<ChallanPage />} />
      <Route
        path=":id/return"
        element={
          <RoleGate roles={DISPATCH_MANAGERS}>
            <ReturnPage />
          </RoleGate>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

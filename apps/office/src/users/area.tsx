import { Route, Routes } from 'react-router';
import { NotFoundPage } from '@/pages/not-found-page';
import { NewUserPage } from './new-user-page';
import { UserList } from './user-list';

/** OWNER only: the menu and the route gate both check. */
export function UsersArea() {
  return (
    <Routes>
      <Route index element={<UserList />} />
      <Route path="new" element={<NewUserPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

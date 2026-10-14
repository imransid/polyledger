import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { Role } from '@/api/types';
import { FullPageMessage } from '@/components/message';
import { text } from '@/i18n';
import { useSession, useUser } from './use-session';

/** Pages behind the login. A session that ends sends the user to log in. */
export function RequireSession() {
  const session = useSession();
  const location = useLocation();
  if (session.status === 'starting') {
    return <FullPageMessage>{text.loading}</FullPageMessage>;
  }
  if (session.status === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

// The menu already hides what a role can't use; this covers typed URLs.
// The API checks every call regardless.
export function RoleGate({
  roles,
  children,
}: {
  roles: Role[];
  children: ReactNode;
}) {
  const user = useUser();
  if (!roles.includes(user.role)) {
    return <p className="text-muted-foreground">{text.errors.noAccess}</p>;
  }
  return children;
}

import { Home, KeyRound, LogOut } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import type { CurrentUser } from '@/api/types';
import { logOut } from '@/auth/session';
import { UserContext, useCurrentUserQuery } from '@/auth/use-session';
import { FullPageMessage } from '@/components/message';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { cn } from '@/lib/utils';
import { menuFor } from './navigation';

export function AppLayout() {
  const user = useCurrentUserQuery();
  if (user.isPending) {
    return <FullPageMessage>{text.loading}</FullPageMessage>;
  }
  if (user.isError) {
    return <FullPageMessage>{user.error.message}</FullPageMessage>;
  }
  return (
    <UserContext value={user.data}>
      {/* The menu goes on top on a phone, such as the guard's at the gate. */}
      <div className="flex min-h-screen flex-col md:flex-row">
        <Sidebar user={user.data} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar user={user.data} />
          <main className="flex-1 p-4 md:p-6 print:p-0">
            <Outlet />
          </main>
        </div>
      </div>
    </UserContext>
  );
}

function Sidebar({ user }: { user: CurrentUser }) {
  const items = [
    { path: '/', label: text.nav.home, icon: Home },
    ...menuFor(user.role),
  ];
  return (
    <aside className="shrink-0 border-b bg-muted/40 p-4 md:w-60 md:border-r md:border-b-0 print:hidden">
      <Link to="/" className="mb-3 block px-3 text-lg font-semibold md:mb-6">
        {text.appName}
      </Link>
      <nav className="flex flex-wrap gap-1 md:grid">
        {items.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                isActive
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )
            }
          >
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

function TopBar({ user }: { user: CurrentUser }) {
  return (
    <header className="flex flex-wrap items-center justify-end gap-2 border-b px-4 py-3 md:px-6 print:hidden">
      <span className="mr-2 text-sm">
        {user.name}
        <span className="text-muted-foreground">
          {' '}
          · {text.roles[user.role]}
        </span>
      </span>
      <Button variant="ghost" size="sm" asChild>
        <Link to="/password">
          <KeyRound />
          {text.session.changePassword}
        </Link>
      </Button>
      <Button variant="outline" size="sm" onClick={() => void logOut()}>
        <LogOut />
        {text.session.logOut}
      </Button>
    </header>
  );
}

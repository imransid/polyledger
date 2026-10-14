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
      <div className="flex min-h-screen">
        <Sidebar user={user.data} />
        <div className="flex flex-1 flex-col">
          <TopBar user={user.data} />
          <main className="flex-1 p-6">
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
    <aside className="w-60 shrink-0 border-r bg-muted/40 p-4">
      <Link to="/" className="mb-6 block px-3 text-lg font-semibold">
        {text.appName}
      </Link>
      <nav className="grid gap-1">
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
    <header className="flex items-center justify-end gap-2 border-b px-6 py-3">
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

import { Navigate } from 'react-router';
import { DASHBOARD_READERS } from '@/auth/permissions';
import { useUser } from '@/auth/use-session';
import { Dashboard } from '@/dashboard/dashboard';
import { text } from '@/i18n';

export function HomePage() {
  const user = useUser();
  // The gate is all a guard does, so it opens straight away.
  if (user.role === 'GUARD') {
    return <Navigate to="/gate" replace />;
  }
  if (DASHBOARD_READERS.includes(user.role)) {
    return <Dashboard />;
  }
  return (
    <div className="grid gap-2">
      <h1 className="text-xl font-semibold">{text.home.welcome(user.name)}</h1>
      <p className="text-muted-foreground">{text.home.intro}</p>
    </div>
  );
}

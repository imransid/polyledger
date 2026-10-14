import { useUser } from '@/auth/use-session';
import { text } from '@/i18n';

export function HomePage() {
  const user = useUser();
  return (
    <div className="grid gap-2">
      <h1 className="text-xl font-semibold">{text.home.welcome(user.name)}</h1>
      <p className="text-muted-foreground">{text.home.intro}</p>
    </div>
  );
}

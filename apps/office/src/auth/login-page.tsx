import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation } from 'react-router';
import { z } from 'zod';
import { ErrorMessage } from '@/components/message';
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { text } from '@/i18n';
import { logIn } from './session';
import { useSession } from './use-session';

const loginForm = z.object({
  login: z.string().trim().min(1, text.required),
  password: z.string().min(1, text.required),
});

export function LoginPage() {
  const session = useSession();
  const location = useLocation();
  const form = useForm({
    resolver: zodResolver(loginForm),
    defaultValues: { login: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  if (session.status === 'signed-in') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/'} replace />;
  }

  const submit = form.handleSubmit(async ({ login, password }) => {
    try {
      await logIn(login, password);
    } catch (error) {
      form.setError('root', {
        message:
          error instanceof Error ? error.message : text.errors.unexpected,
      });
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{text.appName}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={submit} noValidate>
            <TextField
              label={text.login.login}
              autoComplete="username"
              autoFocus
              error={errors.login?.message}
              {...form.register('login')}
            />
            <TextField
              label={text.login.password}
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...form.register('password')}
            />
            <ErrorMessage message={errors.root?.message} />
            <Button type="submit" disabled={isSubmitting}>
              {text.login.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

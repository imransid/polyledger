import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { ErrorMessage } from '@/components/message';
import { TextField } from '@/components/text-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';

const passwordForm = z
  .object({
    currentPassword: z.string().min(1, text.required),
    newPassword: z
      .string()
      .min(8, text.password.tooShort)
      .max(128, text.password.tooLong),
    repeatPassword: z.string(),
  })
  .refine((form) => form.newPassword === form.repeatPassword, {
    message: text.password.mismatch,
    path: ['repeatPassword'],
  });

export function ChangePasswordPage() {
  const [changed, setChanged] = useState(false);
  const form = useForm({
    resolver: zodResolver(passwordForm),
    defaultValues: { currentPassword: '', newPassword: '', repeatPassword: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    setChanged(false);
    try {
      await unwrap(
        api.POST('/auth/password', { body: { currentPassword, newPassword } }),
      );
      form.reset();
      setChanged(true);
    } catch (error) {
      form.setError('root', {
        message:
          error instanceof Error ? error.message : text.errors.unexpected,
      });
    }
  });

  return (
    <div className="grid max-w-sm gap-6">
      <h1 className="text-xl font-semibold">{text.password.title}</h1>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <TextField
          label={text.password.current}
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...form.register('currentPassword')}
        />
        <TextField
          label={text.password.new}
          type="password"
          autoComplete="new-password"
          error={errors.newPassword?.message}
          {...form.register('newPassword')}
        />
        <TextField
          label={text.password.repeat}
          type="password"
          autoComplete="new-password"
          error={errors.repeatPassword?.message}
          {...form.register('repeatPassword')}
        />
        <ErrorMessage message={errors.root?.message} />
        {changed && (
          <Alert>
            <AlertDescription>{text.password.changed}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {text.password.submit}
        </Button>
      </form>
    </div>
  );
}

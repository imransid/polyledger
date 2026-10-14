import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { ErrorMessage } from '@/components/message';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { showApiError } from '@/lib/form-errors';
import { phone, requiredText } from '@/lib/form-fields';
import { useWrite } from '@/lib/use-write';
import { RecordShell } from '@/components/record-shell';
import { ROLES } from './roles';

const words = text.users;

// Either login may be left blank, but not both.
const userForm = z
  .object({
    name: requiredText(100),
    email: z.union([z.literal(''), z.email(text.valid.email)]),
    phone: z.union([z.literal(''), phone()]),
    role: z.enum(ROLES),
    password: z
      .string()
      .min(8, text.password.tooShort)
      .max(128, text.password.tooLong),
  })
  .refine((user) => user.email !== '' || user.phone !== '', {
    message: text.valid.emailOrPhone,
    path: ['email'],
  });

export function NewUserPage() {
  const navigate = useNavigate();
  const write = useWrite('users');
  const form = useForm({
    resolver: zodResolver(userForm),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      role: 'OPERATOR' as const,
      password: '',
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ email, phone, ...user }) => {
    try {
      await unwrap(
        api.POST('/users', {
          body: {
            ...user,
            email: email || undefined,
            phone: phone || undefined,
          },
          headers: write.headers,
        }),
      );
      await write.created();
      navigate('..', { relative: 'path' });
    } catch (error) {
      showApiError(form, error, {
        name: 'name',
        email: 'email',
        phone: 'phone',
        role: 'role',
        password: 'password',
      });
    }
  });

  return (
    <RecordShell title={words.new}>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <TextField
          label={words.name}
          error={errors.name?.message}
          {...form.register('name')}
        />
        <TextField
          label={words.email}
          type="email"
          error={errors.email?.message}
          {...form.register('email')}
        />
        <TextField
          label={words.phone}
          inputMode="tel"
          placeholder="01XXXXXXXXX"
          error={errors.phone?.message}
          {...form.register('phone')}
        />
        <SelectField
          label={words.role}
          options={ROLES.map((role) => ({
            value: role,
            label: text.roles[role],
          }))}
          error={errors.role?.message}
          {...form.register('role')}
        />
        <TextField
          label={words.password}
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...form.register('password')}
        />
        <ErrorMessage message={errors.root?.message} />
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {text.record.save}
          </Button>
        </div>
      </form>
    </RecordShell>
  );
}

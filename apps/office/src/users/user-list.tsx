import { useState } from 'react';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { Role, User } from '@/api/types';
import { ConfirmButton } from '@/components/confirm-button';
import { ACTIVE_FILTER, activeParam } from '@/components/list-options';
import { ListPage } from '@/components/list-page';
import { TextField } from '@/components/text-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { formatPhone } from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import { ROLES } from './roles';

const words = text.users;

export function UserList() {
  return (
    <ListPage<User>
      title={words.title}
      queryKey="users"
      filter={ACTIVE_FILTER}
      canCreate
      searchLabel={words.search}
      load={(query, filter) =>
        unwrap(
          api.GET('/users', {
            params: { query: { ...query, active: activeParam(filter) } },
          }),
        )
      }
      columns={[
        { header: words.name, cell: (user) => user.name },
        {
          header: words.login,
          cell: (user) =>
            [user.email, user.phone && formatPhone(user.phone)]
              .filter(Boolean)
              .join(' · '),
        },
        { header: words.role, cell: (user) => <RoleSelect user={user} /> },
        {
          header: text.masterData.status,
          cell: (user) => (
            <Badge variant={user.isActive ? 'default' : 'secondary'}>
              {user.isActive ? text.record.active : text.record.inactive}
            </Badge>
          ),
        },
        { header: '', cell: (user) => <UserActions user={user} /> },
      ]}
    />
  );
}

function RoleSelect({ user }: { user: User }) {
  const write = useWrite('users');
  const [error, setError] = useState<string>();

  async function change(role: Role) {
    setError(undefined);
    try {
      await unwrap(
        api.PATCH('/users/{id}/role', {
          params: { path: { id: user.id } },
          body: { role },
          headers: write.headers,
        }),
      );
      await write.done();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : text.errors.unexpected,
      );
    }
  }

  return (
    <div className="grid gap-1">
      <select
        aria-label={`${words.changeRole}: ${user.name}`}
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
        value={user.role}
        onChange={(event) => void change(event.target.value as Role)}
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {text.roles[role]}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function UserActions({ user }: { user: User }) {
  const write = useWrite('users');
  const [error, setError] = useState<string>();
  const options = { params: { path: { id: user.id } }, headers: write.headers };

  async function reactivate() {
    setError(undefined);
    try {
      await unwrap(api.POST('/users/{id}/reactivate', options));
      await write.done();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : text.errors.unexpected,
      );
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <ResetPassword user={user} />
      {user.isActive ? (
        <ConfirmButton
          label={text.record.deactivate}
          question={words.confirmDeactivate(user.name)}
          variant="destructive"
          onConfirm={async () => {
            await unwrap(api.POST('/users/{id}/deactivate', options));
            await write.done();
          }}
        />
      ) : (
        <Button variant="outline" size="sm" onClick={() => void reactivate()}>
          {text.record.reactivate}
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function ResetPassword({ user }: { user: User }) {
  const write = useWrite('users');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);

  return (
    <>
      {done && (
        <span className="text-sm text-muted-foreground">
          {words.passwordReset}
        </span>
      )}
      <ConfirmButton
        label={words.resetPassword}
        question={words.confirmReset(user.name)}
        onConfirm={async () => {
          if (password.length < 8) {
            throw new Error(text.password.tooShort);
          }
          await unwrap(
            api.POST('/users/{id}/reset-password', {
              params: { path: { id: user.id } },
              body: { newPassword: password },
              headers: write.headers,
            }),
          );
          await write.done();
          setPassword('');
          setDone(true);
        }}
      >
        <TextField
          label={words.newPassword}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </ConfirmButton>
    </>
  );
}

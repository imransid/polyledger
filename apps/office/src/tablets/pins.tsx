import { isTrivialPin, PIN_PATTERN } from '@polyledger/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { PinHolder } from '@/api/types';
import { ConfirmButton } from '@/components/confirm-button';
import { DataTable } from '@/components/data-table';
import { ErrorMessage } from '@/components/message';
import { TextField } from '@/components/text-field';
import { text } from '@/i18n';
import { formatMoment, formatPhone } from '@/lib/format';
import { useWrite } from '@/lib/use-write';

const words = text.tablets.pins;

export function PinsPage() {
  const pins = useQuery({
    queryKey: ['pins'],
    queryFn: () => unwrap(api.GET('/users/pins')),
  });
  return (
    <div className="grid max-w-4xl gap-4">
      <ErrorMessage message={pins.error?.message} />
      <DataTable<PinHolder>
        rows={pins.data ?? []}
        rowKey={(holder) => holder.id}
        columns={[
          { header: words.name, cell: (holder) => holder.name },
          { header: words.role, cell: (holder) => text.roles[holder.role] },
          {
            header: words.login,
            cell: (holder) =>
              holder.email ?? (holder.phone ? formatPhone(holder.phone) : ''),
          },
          {
            header: words.pin,
            cell: (holder) =>
              holder.lockedUntil ? (
                <span className="font-medium text-amber-700">
                  {words.lockedUntil(formatMoment(holder.lockedUntil))}
                </span>
              ) : holder.hasPin ? (
                words.isSet
              ) : (
                <span className="text-muted-foreground">{words.notSet}</span>
              ),
          },
          { header: '', cell: (holder) => <PinButton holder={holder} /> },
        ]}
      />
    </div>
  );
}

function PinButton({ holder }: { holder: PinHolder }) {
  const write = useWrite('pins');
  const [pin, setPin] = useState('');
  return (
    <ConfirmButton
      label={words.setPin}
      question={words.question(holder.name)}
      onConfirm={async () => {
        if (!PIN_PATTERN.test(pin)) {
          throw new Error(words.invalid);
        }
        if (isTrivialPin(pin)) {
          throw new Error(words.trivial);
        }
        await unwrap(
          api.PUT('/users/{id}/pin', {
            params: { path: { id: holder.id } },
            body: { pin },
            headers: write.headers,
          }),
        );
        setPin('');
        await write.done();
      }}
    >
      <TextField
        label={words.newPin}
        type="password"
        inputMode="numeric"
        autoComplete="new-password"
        value={pin}
        onChange={(event) => setPin(event.target.value)}
      />
    </ConfirmButton>
  );
}

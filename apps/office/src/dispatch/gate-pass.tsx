import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { Challan } from '@/api/types';
import { ConfirmButton } from '@/components/confirm-button';
import { ErrorMessage } from '@/components/message';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { text } from '@/i18n';
import { formatCartons, formatDay, formatPhone } from '@/lib/format';
import { useWrite } from '@/lib/use-write';

const words = text.gate;

// Made for a guard's phone: one challan per card, the vehicle number large,
// and one big button. Trucks that arrive while it is open show up within a
// minute.
export function GatePassPage() {
  const [passed, setPassed] = useState<string>();
  const pending = useQuery({
    queryKey: ['dispatch', 'gate'],
    queryFn: () => unwrap(api.GET('/dispatch/gate-passes/pending')),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <h1 className="text-xl font-semibold">{words.title}</h1>
      {passed && (
        <Alert>
          <AlertDescription>{words.passed(passed)}</AlertDescription>
        </Alert>
      )}
      <ErrorMessage message={pending.error?.message} />
      {pending.data?.length === 0 && (
        <p className="text-muted-foreground">{words.empty}</p>
      )}
      {pending.data?.map((challan) => (
        <GateCard key={challan.id} challan={challan} onPassed={setPassed} />
      ))}
    </div>
  );
}

function GateCard({
  challan,
  onPassed,
}: {
  challan: Challan;
  onPassed: (number: string) => void;
}) {
  const write = useWrite('dispatch');
  return (
    <article
      aria-label={challan.number}
      className="grid gap-3 rounded-lg border p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{challan.number}</span>
        <span className="text-sm text-muted-foreground">
          {formatDay(challan.dispatchedOn)}
        </span>
      </div>
      <p className="text-2xl font-bold tracking-wide">
        {challan.vehicleNumber}
      </p>
      <div className="text-sm">
        <p>{challan.customerName}</p>
        <p className="text-muted-foreground">
          {challan.driverName} · {formatPhone(challan.driverPhone)}
        </p>
      </div>
      <ul className="grid gap-1 text-sm">
        {challan.lines.map((line) => (
          <li key={line.productId} className="flex justify-between gap-2">
            <span>{line.code}</span>
            <span className="tabular-nums">
              {formatCartons(line.pieces, line.piecesPerCarton)}
            </span>
          </li>
        ))}
      </ul>
      <ConfirmButton
        label={words.pass}
        question={words.confirm(challan.number, challan.vehicleNumber)}
        variant="default"
        className="h-14 w-full text-lg"
        onConfirm={async () => {
          await unwrap(
            api.POST('/dispatch/challans/{id}/gate-pass', {
              params: { path: { id: challan.id } },
              headers: write.headers,
            }),
          );
          onPassed(challan.number);
          await write.done();
        }}
      />
    </article>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllLocations } from '@/api/lookups';
import type { Device, Location, PairingCode } from '@/api/types';
import { ConfirmButton } from '@/components/confirm-button';
import { DataTable } from '@/components/data-table';
import { ErrorMessage } from '@/components/message';
import { RecordPending } from '@/components/record-shell';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { showApiError } from '@/lib/form-errors';
import { requiredText } from '@/lib/form-fields';
import { formatMoment } from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import { locationOptions } from '@/stock/lines';

const words = text.tablets.devices;

const deviceForm = z.object({
  name: requiredText(60),
  floorLocationId: z.string().min(1, text.required),
});

export function DevicesPage() {
  const locations = useAllLocations();
  const devices = useQuery({
    queryKey: ['devices'],
    queryFn: () => unwrap(api.GET('/devices')),
  });
  // The code is shown once, right after it is issued.
  const [issued, setIssued] = useState<PairingCode>();
  if (!locations.data) {
    return <RecordPending error={locations.error} />;
  }
  const floors = locations.data.filter(
    (location) => location.kind === 'PRODUCTION_FLOOR',
  );
  const floorCode = (id: string) =>
    floors.find((floor) => floor.id === id)?.code ?? '';

  return (
    <div className="grid max-w-4xl gap-6">
      {issued && <CodePanel issued={issued} />}
      <RegisterForm
        floors={floors.filter((floor) => floor.isActive)}
        onIssued={setIssued}
      />
      <ErrorMessage message={devices.error?.message} />
      {devices.data?.length === 0 ? (
        <p className="text-muted-foreground">{words.none}</p>
      ) : (
        <DataTable<Device>
          rows={devices.data ?? []}
          rowKey={(device) => device.id}
          columns={[
            { header: words.name, cell: (device) => device.name },
            {
              header: words.floor,
              cell: (device) => floorCode(device.floorLocationId),
            },
            {
              header: words.status,
              cell: (device) => <StatusBadge device={device} />,
            },
            {
              header: words.lastSeen,
              cell: (device) =>
                device.lastSeenAt
                  ? formatMoment(device.lastSeenAt)
                  : words.never,
            },
            {
              header: '',
              cell: (device) =>
                device.status !== 'REVOKED' && (
                  <DeviceActions device={device} onIssued={setIssued} />
                ),
            },
          ]}
        />
      )}
    </div>
  );
}

function CodePanel({ issued }: { issued: PairingCode }) {
  const { device, pairingCode } = issued;
  return (
    <Alert>
      <AlertDescription className="grid gap-1">
        <span>{words.code(device.name)}</span>
        <span className="font-mono text-3xl font-bold tracking-widest">
          {pairingCode.slice(0, 4)}-{pairingCode.slice(4)}
        </span>
        {device.pairingExpiresAt && (
          <span>{words.codeHint(formatMoment(device.pairingExpiresAt))}</span>
        )}
      </AlertDescription>
    </Alert>
  );
}

function StatusBadge({ device }: { device: Device }) {
  return (
    <Badge variant={device.status === 'PAIRED' ? 'default' : 'secondary'}>
      {words.statuses[device.status]}
    </Badge>
  );
}

function RegisterForm({
  floors,
  onIssued,
}: {
  floors: Location[];
  onIssued: (issued: PairingCode) => void;
}) {
  const write = useWrite('devices');
  const form = useForm({
    resolver: zodResolver(deviceForm),
    defaultValues: {
      name: '',
      floorLocationId: floors.length === 1 ? floors[0].id : '',
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (device) => {
    try {
      onIssued(
        await unwrap(
          api.POST('/devices', { body: device, headers: write.headers }),
        ),
      );
      await write.done();
      form.reset({ ...device, name: '' });
    } catch (error) {
      showApiError(form, error, {
        name: 'name',
        floorLocationId: 'floorLocationId',
      });
    }
  });

  return (
    <form
      className="grid items-start gap-4 sm:grid-cols-[1fr_1fr_auto]"
      onSubmit={submit}
      noValidate
    >
      <TextField
        label={words.name}
        error={errors.name?.message}
        {...form.register('name')}
      />
      <SelectField
        label={words.floor}
        options={locationOptions(floors)}
        error={errors.floorLocationId?.message}
        {...form.register('floorLocationId')}
      />
      <Button type="submit" className="sm:mt-6" disabled={isSubmitting}>
        {words.register}
      </Button>
      <div className="sm:col-span-3">
        <ErrorMessage message={errors.root?.message} />
      </div>
    </form>
  );
}

function DeviceActions({
  device,
  onIssued,
}: {
  device: Device;
  onIssued: (issued: PairingCode) => void;
}) {
  const write = useWrite('devices');
  const options = {
    params: { path: { id: device.id } },
    headers: write.headers,
  };
  return (
    <div className="flex justify-end gap-2">
      <ConfirmButton
        label={words.newCode}
        question={words.confirmNewCode(device.name)}
        onConfirm={async () => {
          onIssued(
            await unwrap(api.POST('/devices/{id}/pairing-code', options)),
          );
          await write.done();
        }}
      />
      <ConfirmButton
        label={words.revoke}
        question={words.confirmRevoke(device.name)}
        variant="destructive"
        onConfirm={async () => {
          await unwrap(api.POST('/devices/{id}/revoke', options));
          await write.done();
        }}
      />
    </div>
  );
}

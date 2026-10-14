import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { Machine } from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { text } from '@/i18n';
import { showApiError } from '@/lib/form-errors';
import { requiredText, wholeNumber } from '@/lib/form-fields';
import { useWrite } from '@/lib/use-write';
import {
  EQUIPMENT_STATUSES,
  STATUS_FILTER,
  statusParam,
} from '@/components/list-options';
import { CodeLink, ListPage } from '@/components/list-page';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { FormFooter, StatusBadge } from './record';
import { useCanEdit, useRecord } from './use-record';

const words = text.masterData.machines;

export function MachineList() {
  return (
    <ListPage<Machine>
      title={words.title}
      queryKey="machines"
      filter={STATUS_FILTER}
      canCreate={useCanEdit()}
      load={(query, filter) =>
        unwrap(
          api.GET('/machines', {
            params: { query: { ...query, status: statusParam(filter) } },
          }),
        )
      }
      columns={[
        {
          header: text.masterData.code,
          cell: (machine) => <CodeLink id={machine.id} code={machine.code} />,
        },
        { header: text.masterData.name, cell: (machine) => machine.name },
        { header: words.tonnage, cell: (machine) => machine.tonnage },
        {
          header: text.masterData.status,
          cell: (machine) => <StatusBadge status={machine.status} />,
        },
      ]}
    />
  );
}

const machineForm = z.object({
  code: requiredText(20),
  name: requiredText(100),
  tonnage: wholeNumber(),
  status: z.enum(EQUIPMENT_STATUSES),
});

export function MachinePage() {
  const { id = 'new' } = useParams();
  const record = useRecord('machines', id, (id) =>
    unwrap(api.GET('/machines/{id}', { params: { path: { id } } })),
  );
  if (id !== 'new' && !record.data) {
    return <RecordPending error={record.error} />;
  }
  return <MachineForm key={id} machine={record.data} />;
}

function MachineForm({ machine }: { machine?: Machine }) {
  const canEdit = useCanEdit();
  const navigate = useNavigate();
  const write = useWrite('machines');
  const [saved, setSaved] = useState(false);
  const form = useForm({
    resolver: zodResolver(machineForm),
    defaultValues: {
      code: machine?.code ?? '',
      name: machine?.name ?? '',
      tonnage: machine ? String(machine.tonnage) : '',
      status: machine?.status ?? 'ACTIVE',
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ code, status, ...fields }) => {
    setSaved(false);
    try {
      if (machine) {
        await unwrap(
          api.PATCH('/machines/{id}', {
            params: { path: { id: machine.id } },
            body: { ...fields, status },
            headers: write.headers,
          }),
        );
        await write.done();
        setSaved(true);
      } else {
        const created = await unwrap(
          api.POST('/machines', {
            body: { code, ...fields },
            headers: write.headers,
          }),
        );
        await write.created();
        navigate(`../${created.id}`, { relative: 'path', replace: true });
      }
    } catch (error) {
      showApiError(form, error, {
        code: 'code',
        name: 'name',
        tonnage: 'tonnage',
        status: 'status',
      });
    }
  });

  return (
    <RecordShell
      title={machine ? `${machine.code} · ${machine.name}` : words.new}
      badge={machine && <StatusBadge status={machine.status} />}
    >
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <fieldset disabled={!canEdit} className="grid gap-4">
          <TextField
            label={text.masterData.code}
            readOnly={machine !== undefined}
            hint={machine && text.record.codeLocked}
            error={errors.code?.message}
            {...form.register('code')}
          />
          <TextField
            label={text.masterData.name}
            error={errors.name?.message}
            {...form.register('name')}
          />
          <TextField
            label={words.tonnage}
            inputMode="numeric"
            error={errors.tonnage?.message}
            {...form.register('tonnage')}
          />
          {machine && (
            <SelectField
              label={text.masterData.status}
              options={EQUIPMENT_STATUSES.map((status) => ({
                value: status,
                label: text.masterData.statuses[status],
              }))}
              error={errors.status?.message}
              {...form.register('status')}
            />
          )}
        </fieldset>
        <ErrorMessage message={errors.root?.message} />
        <FormFooter canEdit={canEdit} saving={isSubmitting} saved={saved} />
      </form>
    </RecordShell>
  );
}

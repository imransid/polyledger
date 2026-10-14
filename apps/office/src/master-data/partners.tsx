import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { Partner } from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { TextField } from '@/components/text-field';
import { text } from '@/i18n';
import { showApiError } from '@/lib/form-errors';
import { phone, requiredText } from '@/lib/form-fields';
import { formatPhone } from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import {
  ACTIVE_FILTER,
  activeParam,
  type ListQuery,
} from '@/components/list-options';
import { CodeLink, ListPage } from '@/components/list-page';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { ActiveBadge, ActiveToggle, FormFooter } from './record';
import { useCanEdit, useRecord } from './use-record';

/** Customers and suppliers are kept the same way. */
type PartnerKind = 'customers' | 'suppliers';

type Headers = Record<string, string>;
interface PartnerFields {
  name: string;
  phone: string;
  address: string;
}

const ENDPOINTS = {
  customers: {
    list: (query: ListQuery & { active?: 'true' | 'false' }) =>
      unwrap(api.GET('/customers', { params: { query } })),
    get: (id: string) =>
      unwrap(api.GET('/customers/{id}', { params: { path: { id } } })),
    create: (body: PartnerFields & { code: string }, headers: Headers) =>
      unwrap(api.POST('/customers', { body, headers })),
    update: (id: string, body: PartnerFields, headers: Headers) =>
      unwrap(
        api.PATCH('/customers/{id}', {
          params: { path: { id } },
          body,
          headers,
        }),
      ),
    setActive: (id: string, active: boolean, headers: Headers) => {
      const options = { params: { path: { id } }, headers };
      return unwrap(
        active
          ? api.POST('/customers/{id}/reactivate', options)
          : api.POST('/customers/{id}/deactivate', options),
      );
    },
  },
  suppliers: {
    list: (query: ListQuery & { active?: 'true' | 'false' }) =>
      unwrap(api.GET('/suppliers', { params: { query } })),
    get: (id: string) =>
      unwrap(api.GET('/suppliers/{id}', { params: { path: { id } } })),
    create: (body: PartnerFields & { code: string }, headers: Headers) =>
      unwrap(api.POST('/suppliers', { body, headers })),
    update: (id: string, body: PartnerFields, headers: Headers) =>
      unwrap(
        api.PATCH('/suppliers/{id}', {
          params: { path: { id } },
          body,
          headers,
        }),
      ),
    setActive: (id: string, active: boolean, headers: Headers) => {
      const options = { params: { path: { id } }, headers };
      return unwrap(
        active
          ? api.POST('/suppliers/{id}/reactivate', options)
          : api.POST('/suppliers/{id}/deactivate', options),
      );
    },
  },
} satisfies Record<PartnerKind, unknown>;

export function PartnerList({ kind }: { kind: PartnerKind }) {
  return (
    <ListPage<Partner>
      title={text.masterData[kind].title}
      queryKey={kind}
      filter={ACTIVE_FILTER}
      canCreate={useCanEdit()}
      load={(query, filter) =>
        ENDPOINTS[kind].list({ ...query, active: activeParam(filter) })
      }
      columns={[
        {
          header: text.masterData.code,
          cell: (partner) => <CodeLink id={partner.id} code={partner.code} />,
        },
        { header: text.masterData.name, cell: (partner) => partner.name },
        {
          header: text.masterData.phone,
          cell: (partner) => formatPhone(partner.phone),
        },
        { header: text.masterData.address, cell: (partner) => partner.address },
        {
          header: text.masterData.status,
          cell: (partner) => <ActiveBadge isActive={partner.isActive} />,
        },
      ]}
    />
  );
}

const partnerForm = z.object({
  code: requiredText(20),
  name: requiredText(100),
  phone: phone(),
  address: requiredText(300),
});

export function PartnerPage({ kind }: { kind: PartnerKind }) {
  const { id = 'new' } = useParams();
  const record = useRecord(kind, id, ENDPOINTS[kind].get);
  if (id !== 'new' && !record.data) {
    return <RecordPending error={record.error} />;
  }
  return <PartnerForm key={id} kind={kind} partner={record.data} />;
}

function PartnerForm({
  kind,
  partner,
}: {
  kind: PartnerKind;
  partner?: Partner;
}) {
  const canEdit = useCanEdit();
  const navigate = useNavigate();
  const write = useWrite(kind);
  const [saved, setSaved] = useState(false);
  const endpoints = ENDPOINTS[kind];
  const form = useForm({
    resolver: zodResolver(partnerForm),
    defaultValues: {
      code: partner?.code ?? '',
      name: partner?.name ?? '',
      phone: partner ? formatPhone(partner.phone) : '',
      address: partner?.address ?? '',
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ code, ...fields }) => {
    setSaved(false);
    try {
      if (partner) {
        await endpoints.update(partner.id, fields, write.headers);
        await write.done();
        setSaved(true);
      } else {
        const created = await endpoints.create(
          { code, ...fields },
          write.headers,
        );
        await write.created();
        navigate(`../${created.id}`, { relative: 'path', replace: true });
      }
    } catch (error) {
      showApiError(form, error, {
        code: 'code',
        name: 'name',
        phone: 'phone',
        address: 'address',
      });
    }
  });

  return (
    <RecordShell
      title={
        partner
          ? `${partner.code} · ${partner.name}`
          : text.masterData[kind].new
      }
      badge={partner && <ActiveBadge isActive={partner.isActive} />}
      actions={
        partner &&
        canEdit && (
          <ActiveToggle
            isActive={partner.isActive}
            queryKey={kind}
            setActive={(active, headers) =>
              endpoints.setActive(partner.id, active, headers)
            }
          />
        )
      }
    >
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <fieldset disabled={!canEdit} className="grid gap-4">
          <TextField
            label={text.masterData.code}
            readOnly={partner !== undefined}
            hint={partner && text.record.codeLocked}
            error={errors.code?.message}
            {...form.register('code')}
          />
          <TextField
            label={text.masterData.name}
            error={errors.name?.message}
            {...form.register('name')}
          />
          <TextField
            label={text.masterData.phone}
            inputMode="tel"
            placeholder="01XXXXXXXXX"
            error={errors.phone?.message}
            {...form.register('phone')}
          />
          <TextField
            label={text.masterData.address}
            error={errors.address?.message}
            {...form.register('address')}
          />
        </fieldset>
        <ErrorMessage message={errors.root?.message} />
        <FormFooter canEdit={canEdit} saving={isSubmitting} saved={saved} />
      </form>
    </RecordShell>
  );
}

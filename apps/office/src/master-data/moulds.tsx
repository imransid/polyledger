import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { Mould } from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { text } from '@/i18n';
import { formatDecimal } from '@/lib/decimal';
import { showApiError } from '@/lib/form-errors';
import { decimal, requiredText, wholeNumber } from '@/lib/form-fields';
import { formatGrams, formatSeconds } from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import {
  EQUIPMENT_STATUSES,
  STATUS_FILTER,
  statusParam,
} from '@/components/list-options';
import { useAllProducts } from '@/api/lookups';
import { CodeLink, ListPage } from '@/components/list-page';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { FormFooter, StatusBadge } from './record';
import { useCanEdit, useRecord } from './use-record';

const words = text.masterData.moulds;

export function MouldList() {
  const products = useAllProducts();
  const productCode = (id: string) =>
    products.data?.find((product) => product.id === id)?.code ?? '…';
  return (
    <ListPage<Mould>
      title={words.title}
      queryKey="moulds"
      filter={STATUS_FILTER}
      canCreate={useCanEdit()}
      load={(query, filter) =>
        unwrap(
          api.GET('/moulds', {
            params: { query: { ...query, status: statusParam(filter) } },
          }),
        )
      }
      columns={[
        {
          header: text.masterData.code,
          cell: (mould) => <CodeLink id={mould.id} code={mould.code} />,
        },
        { header: text.masterData.name, cell: (mould) => mould.name },
        {
          header: words.product,
          cell: (mould) => productCode(mould.productId),
        },
        { header: words.cavities, cell: (mould) => mould.cavities },
        {
          header: words.cycleTime,
          cell: (mould) => formatSeconds(mould.cycleTimeTenths),
        },
        {
          header: words.runnerWeight,
          cell: (mould) => formatGrams(mould.runnerWeightMg),
        },
        {
          header: text.masterData.status,
          cell: (mould) => <StatusBadge status={mould.status} />,
        },
      ]}
    />
  );
}

// Seconds with one decimal ("8.5") are stored as tenths (85); runner grams
// ("18") as milligrams (18000).
const mouldForm = z.object({
  code: requiredText(20),
  name: requiredText(100),
  productId: z.string().min(1, text.required),
  cavities: wholeNumber(),
  cycleTime: decimal(1, text.valid.seconds),
  runnerWeight: decimal(3, text.valid.grams),
  status: z.enum(EQUIPMENT_STATUSES),
});

export function MouldPage() {
  const { id = 'new' } = useParams();
  const record = useRecord('moulds', id, (id) =>
    unwrap(api.GET('/moulds/{id}', { params: { path: { id } } })),
  );
  if (id !== 'new' && !record.data) {
    return <RecordPending error={record.error} />;
  }
  return <MouldForm key={id} mould={record.data} />;
}

function MouldForm({ mould }: { mould?: Mould }) {
  const canEdit = useCanEdit();
  const navigate = useNavigate();
  const products = useAllProducts();
  const write = useWrite('moulds');
  const [saved, setSaved] = useState(false);
  const form = useForm({
    resolver: zodResolver(mouldForm),
    defaultValues: {
      code: mould?.code ?? '',
      name: mould?.name ?? '',
      productId: mould?.productId ?? '',
      cavities: mould ? String(mould.cavities) : '',
      cycleTime: mould ? formatDecimal(mould.cycleTimeTenths, 1) : '',
      runnerWeight: mould ? formatDecimal(mould.runnerWeightMg, 3) : '0',
      status: mould?.status ?? 'ACTIVE',
    },
  });
  const { errors, isSubmitting } = form.formState;
  // Inactive products can't get new moulds, but the current one stays listed.
  const productOptions = (products.data ?? [])
    .filter((product) => product.isActive || product.id === mould?.productId)
    .map((product) => ({
      value: product.id,
      label: `${product.code} · ${product.name}`,
    }));

  const submit = form.handleSubmit(
    async ({ code, cycleTime, runnerWeight, status, ...fields }) => {
      setSaved(false);
      const body = {
        ...fields,
        cycleTimeTenths: cycleTime,
        runnerWeightMg: runnerWeight,
      };
      try {
        if (mould) {
          await unwrap(
            api.PATCH('/moulds/{id}', {
              params: { path: { id: mould.id } },
              body: { ...body, status },
              headers: write.headers,
            }),
          );
          await write.done();
          setSaved(true);
        } else {
          const created = await unwrap(
            api.POST('/moulds', {
              body: { code, ...body },
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
          productId: 'productId',
          cavities: 'cavities',
          cycleTimeTenths: 'cycleTime',
          runnerWeightMg: 'runnerWeight',
          status: 'status',
        });
      }
    },
  );

  return (
    <RecordShell
      title={mould ? `${mould.code} · ${mould.name}` : words.new}
      badge={mould && <StatusBadge status={mould.status} />}
    >
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <fieldset disabled={!canEdit} className="grid gap-4">
          <TextField
            label={text.masterData.code}
            readOnly={mould !== undefined}
            hint={mould && text.record.codeLocked}
            error={errors.code?.message}
            {...form.register('code')}
          />
          <TextField
            label={text.masterData.name}
            error={errors.name?.message}
            {...form.register('name')}
          />
          <SelectField
            label={words.product}
            options={[
              { value: '', label: words.chooseProduct },
              ...productOptions,
            ]}
            error={errors.productId?.message}
            {...form.register('productId')}
          />
          <TextField
            label={words.cavities}
            inputMode="numeric"
            error={errors.cavities?.message}
            {...form.register('cavities')}
          />
          <TextField
            label={words.cycleTime}
            inputMode="decimal"
            error={errors.cycleTime?.message}
            {...form.register('cycleTime')}
          />
          <TextField
            label={words.runnerWeight}
            inputMode="decimal"
            hint={words.runnerHint}
            error={errors.runnerWeight?.message}
            {...form.register('runnerWeight')}
          />
          {mould && (
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

import { zodResolver } from '@hookform/resolvers/zod';
import { formatKilograms, grams } from '@polyledger/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { RawMaterial, RawMaterialType } from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { text } from '@/i18n';
import { showApiError } from '@/lib/form-errors';
import { decimal, requiredText } from '@/lib/form-fields';
import { formatWeight } from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import { ACTIVE_FILTER, activeParam } from '@/components/list-options';
import { CodeLink, ListPage } from '@/components/list-page';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { ActiveBadge, ActiveToggle, FormFooter } from './record';
import { useCanEdit, useRecord } from './use-record';

const words = text.masterData.rawMaterials;
const TYPES: RawMaterialType[] = [
  'RESIN',
  'MASTERBATCH',
  'ADDITIVE',
  'REGRIND',
];

export function RawMaterialList() {
  return (
    <ListPage<RawMaterial>
      title={words.title}
      queryKey="raw-materials"
      filter={ACTIVE_FILTER}
      canCreate={useCanEdit()}
      load={(query, filter) =>
        unwrap(
          api.GET('/raw-materials', {
            params: { query: { ...query, active: activeParam(filter) } },
          }),
        )
      }
      columns={[
        {
          header: text.masterData.code,
          cell: (material) => (
            <CodeLink id={material.id} code={material.code} />
          ),
        },
        { header: text.masterData.name, cell: (material) => material.name },
        { header: words.type, cell: (material) => words.types[material.type] },
        {
          header: words.minimumStock,
          cell: (material) => formatWeight(material.minimumStockGrams),
        },
        {
          header: text.masterData.status,
          cell: (material) => <ActiveBadge isActive={material.isActive} />,
        },
      ]}
    />
  );
}

const rawMaterialForm = z.object({
  code: requiredText(20),
  name: requiredText(100),
  type: z.enum(TYPES),
  minimumStock: decimal(3, text.valid.kilograms),
});

export function RawMaterialPage() {
  const { id = 'new' } = useParams();
  const record = useRecord('raw-materials', id, (id) =>
    unwrap(api.GET('/raw-materials/{id}', { params: { path: { id } } })),
  );
  if (id !== 'new' && !record.data) {
    return <RecordPending error={record.error} />;
  }
  return <RawMaterialForm key={id} material={record.data} />;
}

function RawMaterialForm({ material }: { material?: RawMaterial }) {
  const canEdit = useCanEdit();
  const navigate = useNavigate();
  const write = useWrite('raw-materials');
  const [saved, setSaved] = useState(false);
  const form = useForm({
    resolver: zodResolver(rawMaterialForm),
    defaultValues: {
      code: material?.code ?? '',
      name: material?.name ?? '',
      type: material?.type ?? 'RESIN',
      minimumStock: material
        ? formatKilograms(grams(material.minimumStockGrams))
        : '',
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(
    async ({ code, minimumStock, ...fields }) => {
      setSaved(false);
      const body = { ...fields, minimumStockGrams: minimumStock };
      try {
        if (material) {
          await unwrap(
            api.PATCH('/raw-materials/{id}', {
              params: { path: { id: material.id } },
              body,
              headers: write.headers,
            }),
          );
          await write.done();
          setSaved(true);
        } else {
          const created = await unwrap(
            api.POST('/raw-materials', {
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
          type: 'type',
          minimumStockGrams: 'minimumStock',
        });
      }
    },
  );

  return (
    <RecordShell
      title={material ? `${material.code} · ${material.name}` : words.new}
      badge={material && <ActiveBadge isActive={material.isActive} />}
      actions={
        material &&
        canEdit && (
          <ActiveToggle
            isActive={material.isActive}
            queryKey="raw-materials"
            setActive={(active, headers) => {
              const options = {
                params: { path: { id: material.id } },
                headers,
              };
              return unwrap(
                active
                  ? api.POST('/raw-materials/{id}/reactivate', options)
                  : api.POST('/raw-materials/{id}/deactivate', options),
              );
            }}
          />
        )
      }
    >
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <fieldset disabled={!canEdit} className="grid gap-4">
          <TextField
            label={text.masterData.code}
            readOnly={material !== undefined}
            hint={material && text.record.codeLocked}
            error={errors.code?.message}
            {...form.register('code')}
          />
          <TextField
            label={text.masterData.name}
            error={errors.name?.message}
            {...form.register('name')}
          />
          <SelectField
            label={words.type}
            options={TYPES.map((type) => ({
              value: type,
              label: words.types[type],
            }))}
            error={errors.type?.message}
            {...form.register('type')}
          />
          <TextField
            label={words.minimumStock}
            inputMode="decimal"
            error={errors.minimumStock?.message}
            {...form.register('minimumStock')}
          />
        </fieldset>
        <ErrorMessage message={errors.root?.message} />
        <FormFooter canEdit={canEdit} saving={isSubmitting} saved={saved} />
      </form>
    </RecordShell>
  );
}

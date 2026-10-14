import { zodResolver } from '@hookform/resolvers/zod';
import { FlaskConical } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { Product } from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { formatDecimal } from '@/lib/decimal';
import { showApiError } from '@/lib/form-errors';
import { decimal, requiredText, wholeNumber } from '@/lib/form-fields';
import { formatGrams } from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import { ACTIVE_FILTER, activeParam } from '@/components/list-options';
import { CodeLink, ListPage } from '@/components/list-page';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { ActiveBadge, ActiveToggle, FormFooter } from './record';
import { useCanEdit, useRecord } from './use-record';

const words = text.masterData.products;

export function ProductList() {
  return (
    <ListPage<Product>
      title={words.title}
      queryKey="products"
      filter={ACTIVE_FILTER}
      canCreate={useCanEdit()}
      load={(query, filter) =>
        unwrap(
          api.GET('/products', {
            params: { query: { ...query, active: activeParam(filter) } },
          }),
        )
      }
      columns={[
        {
          header: text.masterData.code,
          cell: (product) => <CodeLink id={product.id} code={product.code} />,
        },
        { header: text.masterData.name, cell: (product) => product.name },
        {
          header: words.pieceWeight,
          cell: (product) => formatGrams(product.pieceWeightMg),
        },
        { header: words.colour, cell: (product) => product.colour },
        {
          header: words.piecesPerCarton,
          cell: (product) => product.piecesPerCarton,
        },
        {
          header: text.masterData.status,
          cell: (product) => <ActiveBadge isActive={product.isActive} />,
        },
      ]}
    />
  );
}

// Piece weight is typed in grams ("2.5") and stored in milligrams (2500).
const productForm = z.object({
  code: requiredText(20),
  name: requiredText(100),
  pieceWeight: decimal(3, text.valid.grams),
  colour: requiredText(50),
  piecesPerCarton: wholeNumber(),
});

export function ProductPage() {
  const { id = 'new' } = useParams();
  const record = useRecord('products', id, (id) =>
    unwrap(api.GET('/products/{id}', { params: { path: { id } } })),
  );
  if (id !== 'new' && !record.data) {
    return <RecordPending error={record.error} />;
  }
  return <ProductForm key={id} product={record.data} />;
}

function ProductForm({ product }: { product?: Product }) {
  const canEdit = useCanEdit();
  const navigate = useNavigate();
  const write = useWrite('products');
  const [saved, setSaved] = useState(false);
  const form = useForm({
    resolver: zodResolver(productForm),
    defaultValues: {
      code: product?.code ?? '',
      name: product?.name ?? '',
      pieceWeight: product ? formatDecimal(product.pieceWeightMg, 3) : '',
      colour: product?.colour ?? '',
      piecesPerCarton: product ? String(product.piecesPerCarton) : '',
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ code, pieceWeight, ...fields }) => {
    setSaved(false);
    const body = { ...fields, pieceWeightMg: pieceWeight };
    try {
      if (product) {
        await unwrap(
          api.PATCH('/products/{id}', {
            params: { path: { id: product.id } },
            body,
            headers: write.headers,
          }),
        );
        await write.done();
        setSaved(true);
      } else {
        const created = await unwrap(
          api.POST('/products', {
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
        pieceWeightMg: 'pieceWeight',
        colour: 'colour',
        piecesPerCarton: 'piecesPerCarton',
      });
    }
  });

  return (
    <RecordShell
      title={product ? `${product.code} · ${product.name}` : words.new}
      badge={product && <ActiveBadge isActive={product.isActive} />}
      actions={
        product && (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="formulas">
                <FlaskConical />
                {words.formulas}
              </Link>
            </Button>
            {canEdit && (
              <ActiveToggle
                isActive={product.isActive}
                queryKey="products"
                setActive={(active, headers) => {
                  const options = {
                    params: { path: { id: product.id } },
                    headers,
                  };
                  return unwrap(
                    active
                      ? api.POST('/products/{id}/reactivate', options)
                      : api.POST('/products/{id}/deactivate', options),
                  );
                }}
              />
            )}
          </>
        )
      }
    >
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <fieldset disabled={!canEdit} className="grid gap-4">
          <TextField
            label={text.masterData.code}
            readOnly={product !== undefined}
            hint={product && text.record.codeLocked}
            error={errors.code?.message}
            {...form.register('code')}
          />
          <TextField
            label={text.masterData.name}
            error={errors.name?.message}
            {...form.register('name')}
          />
          <TextField
            label={words.pieceWeight}
            inputMode="decimal"
            error={errors.pieceWeight?.message}
            {...form.register('pieceWeight')}
          />
          <TextField
            label={words.colour}
            error={errors.colour?.message}
            {...form.register('colour')}
          />
          <TextField
            label={words.piecesPerCarton}
            inputMode="numeric"
            error={errors.piecesPerCarton?.message}
            {...form.register('piecesPerCarton')}
          />
        </fieldset>
        <ErrorMessage message={errors.root?.message} />
        <FormFooter canEdit={canEdit} saving={isSubmitting} saved={saved} />
      </form>
    </RecordShell>
  );
}

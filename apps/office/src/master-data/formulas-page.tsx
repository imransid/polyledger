import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { FormulaVersion, Product, RawMaterial } from '@/api/types';
import { ConfirmButton } from '@/components/confirm-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { text } from '@/i18n';
import { formatGrams, formatMoment, formatPercent } from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import { type Formula, FormulaEditor } from './formula-editor';
import { useAllRawMaterials } from '@/api/lookups';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { useCanEdit, useRecord } from './use-record';

const words = text.formulas;

export function FormulasPage() {
  const { id = '' } = useParams();
  const product = useRecord('products', id, (id) =>
    unwrap(api.GET('/products/{id}', { params: { path: { id } } })),
  );
  const versions = useQuery({
    queryKey: ['formulas', id],
    queryFn: () =>
      unwrap(
        api.GET('/products/{productId}/formulas', {
          params: { path: { productId: id } },
        }),
      ),
  });
  const materials = useAllRawMaterials();
  if (!product.data || !versions.data || !materials.data) {
    return (
      <RecordPending
        error={product.error ?? versions.error ?? materials.error}
      />
    );
  }
  return (
    <Formulas
      product={product.data}
      versions={versions.data}
      materials={materials.data}
    />
  );
}

interface FormulasProps {
  product: Product;
  versions: FormulaVersion[];
  materials: RawMaterial[];
}

function Formulas({ product, versions, materials }: FormulasProps) {
  const canEdit = useCanEdit();
  const write = useWrite('formulas');
  const active = versions.find((version) => version.isActive);
  const codeOf = (id: string) =>
    materials.find((material) => material.id === id)?.code ?? id;

  async function create(formula: Formula) {
    await unwrap(
      api.POST('/products/{productId}/formulas', {
        params: { path: { productId: product.id } },
        body: formula,
        headers: write.headers,
      }),
    );
    await write.done();
  }

  return (
    <RecordShell title={words.title(product.code)}>
      <p className="text-muted-foreground">
        {product.name} · {words.pieceWeight(formatGrams(product.pieceWeightMg))}
      </p>
      {versions.length === 0 && <p>{words.none}</p>}
      {versions.map((version) => (
        <Card key={version.id}>
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              {words.version(version.version)}
              {version.isActive && <Badge>{words.activeBadge}</Badge>}
            </CardTitle>
            {canEdit && !version.isActive && (
              <ActivateVersion version={version} productCode={product.code} />
            )}
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {version.lines.map((line) => (
              <p
                key={line.rawMaterialId}
                className="flex justify-between gap-4"
              >
                <span>{codeOf(line.rawMaterialId)}</span>
                <span>{formatPercent(line.basisPoints)}</span>
              </p>
            ))}
            <p className="flex justify-between gap-4 text-muted-foreground">
              <span>{words.waste}</span>
              <span>{formatPercent(version.wasteBasisPoints)}</span>
            </p>
            <p className="text-muted-foreground">
              {words.created}: {formatMoment(version.createdAt)}
            </p>
          </CardContent>
        </Card>
      ))}
      {canEdit && product.isActive && (
        <Card>
          <CardHeader>
            <CardTitle>{words.newVersion}</CardTitle>
          </CardHeader>
          <CardContent>
            <FormulaEditor
              pieceWeightMg={product.pieceWeightMg}
              materials={materials.filter((material) => material.isActive)}
              startFrom={active}
              onSave={create}
            />
          </CardContent>
        </Card>
      )}
    </RecordShell>
  );
}

// Job cards freeze the formula when they are created, so activating the
// wrong version changes what future production consumes: ask first.
function ActivateVersion({
  version,
  productCode,
}: {
  version: FormulaVersion;
  productCode: string;
}) {
  const write = useWrite('formulas');
  return (
    <ConfirmButton
      label={words.activate}
      question={words.confirmActivate(version.version, productCode)}
      onConfirm={async () => {
        await unwrap(
          api.POST('/formulas/{id}/activate', {
            params: { path: { id: version.id } },
            headers: write.headers,
          }),
        );
        await write.done();
      }}
    />
  );
}

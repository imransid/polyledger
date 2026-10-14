import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { DataTable } from '@/components/data-table';
import { ErrorMessage } from '@/components/message';
import { text } from '@/i18n';
import { formatPieces, formatWeight } from '@/lib/format';

const words = text.orders;

/** What confirmed orders need beyond the stores, all orders together. */
export function BuyList() {
  const shortages = useQuery({
    queryKey: ['sales-orders', 'material-shortages'],
    queryFn: () => unwrap(api.GET('/sales-orders/material-shortages')),
  });
  if (!shortages.data) {
    return <ErrorMessage message={shortages.error?.message} />;
  }
  const { missingFormulas, materials, products } = shortages.data;
  const short = materials.filter((material) => material.shortageGrams > 0);
  return (
    <div className="grid gap-4">
      {missingFormulas.length > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {words.missingFormulas(
            missingFormulas.map((product) => product.code).join(', '),
          )}
        </p>
      )}
      {short.length === 0 ? (
        <p className="text-muted-foreground">{words.buyListEmpty}</p>
      ) : (
        <DataTable
          rows={short}
          rowKey={(material) => material.rawMaterialId}
          columns={[
            { header: text.masterData.code, cell: (material) => material.code },
            { header: text.masterData.name, cell: (material) => material.name },
            {
              header: words.needed,
              numeric: true,
              cell: (material) => formatWeight(material.neededGrams),
            },
            {
              header: words.available,
              numeric: true,
              cell: (material) => formatWeight(material.availableGrams),
            },
            {
              header: words.short,
              numeric: true,
              cell: (material) => (
                <span className="font-medium text-destructive">
                  {formatWeight(material.shortageGrams)}
                </span>
              ),
            },
          ]}
        />
      )}
      <DataTable
        rows={products}
        rowKey={(product) => product.productId}
        columns={[
          { header: words.product, cell: (product) => product.code },
          {
            header: words.ordered,
            numeric: true,
            cell: (product) => formatPieces(product.orderedPieces),
          },
          {
            header: words.fromStock,
            numeric: true,
            cell: (product) => formatPieces(product.fromStockPieces),
          },
          {
            header: words.toProduce,
            numeric: true,
            cell: (product) => formatPieces(product.toProducePieces),
          },
        ]}
      />
    </div>
  );
}

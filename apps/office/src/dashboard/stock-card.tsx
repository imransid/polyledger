import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { text } from '@/i18n';
import { formatPieces } from '@/lib/format';
import { DashboardCard, Figure } from './parts';

const words = text.dashboard.stock;

export function StockCard() {
  const stock = useQuery({
    queryKey: ['dashboard', 'stock'],
    queryFn: () => unwrap(api.GET('/dashboard/stock')),
  });
  return (
    <DashboardCard title={words.title} query={stock}>
      {(figures) => (
        <>
          <Figure
            to="/stock/low-stock"
            value={String(figures.lowStockCount)}
            label={words.lowStock}
            tone={figures.lowStockCount > 0 ? 'warning' : undefined}
          />
          <div className="grid gap-1 px-2">
            <p className="text-2xl font-semibold tabular-nums">
              {formatPieces(figures.finishedGoodsPieces)}
            </p>
            <p className="text-sm text-muted-foreground">
              {words.finishedGoods}
            </p>
            <ul className="grid gap-1 text-sm">
              {figures.finishedGoodsStores.map((store) => (
                <li key={store.locationId}>
                  <Link
                    to={`/stock/balances?location=${store.locationId}&type=PRODUCT`}
                    className="flex justify-between gap-3 underline-offset-4 hover:underline"
                  >
                    <span>
                      {store.code} · {store.name}
                    </span>
                    <span className="tabular-nums">
                      {formatPieces(store.pieces)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </DashboardCard>
  );
}

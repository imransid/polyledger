import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllProducts, useAllRawMaterials } from '@/api/lookups';
import type { StockItemType } from '@/api/types';
import { useWrite } from '@/lib/use-write';
import { itemValue } from './lines';

/** What a location holds now, by item value: grams or pieces. */
export function useLocationBalances(locationId: string) {
  return useQuery({
    queryKey: ['stock', 'balances', 'location', locationId],
    enabled: locationId !== '',
    queryFn: async () => {
      const page = await unwrap(
        api.GET('/stock/balances', {
          params: { query: { locationId, page: 1, pageSize: 200 } },
        }),
      );
      return new Map(
        page.items.map((balance) => [
          itemValue(balance),
          balance.pieces ?? balance.grams,
        ]),
      );
    },
  });
}

// Stock forms stay open for the next document, so each success renews the
// key and refreshes every stock view.
export function usePosting() {
  const write = useWrite('stock');
  const [posted, setPosted] = useState<{ id: string; number: string }>();
  return {
    headers: write.headers,
    posted,
    async succeeded(document: { id: string; number: string }) {
      setPosted(document);
      await write.done();
    },
  };
}

/** Codes and names for item ids, from the master data lookups. */
export function useItems() {
  const materials = useAllRawMaterials();
  const products = useAllProducts();
  return {
    ready: materials.data !== undefined && products.data !== undefined,
    error: materials.error ?? products.error,
    materials: materials.data ?? [],
    products: products.data ?? [],
    find(itemType: StockItemType, itemId: string) {
      const items = itemType === 'PRODUCT' ? products.data : materials.data;
      return items?.find((item) => item.id === itemId);
    },
  };
}

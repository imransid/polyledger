import { http, HttpResponse } from 'msw';
import type { Location } from '@/api/types';
import { location, page, partner, product, rawMaterial } from './fixtures';

export const store = location();
export const floor = location({
  id: '00000000-0000-4000-8000-000000000102',
  code: 'FLOOR',
  name: 'Production floor',
  kind: 'PRODUCTION_FLOOR',
});
export const fgStore = location({
  id: '00000000-0000-4000-8000-000000000103',
  code: 'FG-STORE',
  name: 'Finished goods store',
  kind: 'FINISHED_GOODS_STORE',
});
export const supplier = partner({
  id: '00000000-0000-4000-8000-000000000301',
  code: 'SUP-BENGAL',
  name: 'Bengal Polymer Traders',
});

/** The master data every stock screen looks codes up in. */
export function stockLookups(locations: Location[] = [store, floor, fgStore]) {
  return [
    http.get('*/api/locations', () => HttpResponse.json(page(locations))),
    http.get('*/api/suppliers', () => HttpResponse.json(page([supplier]))),
    http.get('*/api/raw-materials', () =>
      HttpResponse.json(page([rawMaterial()])),
    ),
    http.get('*/api/products', () => HttpResponse.json(page([product()]))),
  ];
}

import { http, HttpResponse } from 'msw';
import {
  location,
  machine,
  mould,
  page,
  partner,
  product,
  rawMaterial,
} from './fixtures';

export const operator = {
  id: '00000000-0000-4000-8000-000000000701',
  name: 'Shahin Alam',
};
export const floor = location({
  id: '00000000-0000-4000-8000-000000000102',
  code: 'FLOOR',
  name: 'Production floor',
  kind: 'PRODUCTION_FLOOR',
});
export const regrind = rawMaterial({
  id: '00000000-0000-4000-8000-0000000000a9',
  code: 'RG-PP-01',
  name: 'PP regrind',
  type: 'REGRIND',
});

/** The master data the order and production screens look codes up in. */
export function productionLookups() {
  return [
    http.get('*/api/customers', () => HttpResponse.json(page([partner()]))),
    http.get('*/api/products', () => HttpResponse.json(page([product()]))),
    http.get('*/api/machines', () => HttpResponse.json(page([machine()]))),
    http.get('*/api/moulds', () => HttpResponse.json(page([mould()]))),
    http.get('*/api/raw-materials', () =>
      HttpResponse.json(page([rawMaterial(), regrind])),
    ),
    http.get('*/api/locations', () =>
      HttpResponse.json(page([location(), floor])),
    ),
    http.get('*/api/users/operators', () => HttpResponse.json([operator])),
  ];
}

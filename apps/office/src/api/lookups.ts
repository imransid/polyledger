import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';

// For pickers and for showing codes next to ids. A plant has tens of each,
// well under the 200 the API returns in one page.
const EVERYTHING = { page: 1, pageSize: 200 };

export function useAllProducts() {
  return useQuery({
    queryKey: ['products', 'all'],
    queryFn: async () =>
      (await unwrap(api.GET('/products', { params: { query: EVERYTHING } })))
        .items,
  });
}

export function useAllRawMaterials() {
  return useQuery({
    queryKey: ['raw-materials', 'all'],
    queryFn: async () =>
      (
        await unwrap(
          api.GET('/raw-materials', { params: { query: EVERYTHING } }),
        )
      ).items,
  });
}

export function useAllLocations() {
  return useQuery({
    queryKey: ['locations', 'all'],
    queryFn: async () =>
      (await unwrap(api.GET('/locations', { params: { query: EVERYTHING } })))
        .items,
  });
}

export function useAllSuppliers() {
  return useQuery({
    queryKey: ['suppliers', 'all'],
    queryFn: async () =>
      (await unwrap(api.GET('/suppliers', { params: { query: EVERYTHING } })))
        .items,
  });
}

export function useAllCustomers() {
  return useQuery({
    queryKey: ['customers', 'all'],
    queryFn: async () =>
      (await unwrap(api.GET('/customers', { params: { query: EVERYTHING } })))
        .items,
  });
}

export function useAllMachines() {
  return useQuery({
    queryKey: ['machines', 'all'],
    queryFn: async () =>
      (await unwrap(api.GET('/machines', { params: { query: EVERYTHING } })))
        .items,
  });
}

export function useAllMoulds() {
  return useQuery({
    queryKey: ['moulds', 'all'],
    queryFn: async () =>
      (await unwrap(api.GET('/moulds', { params: { query: EVERYTHING } })))
        .items,
  });
}

/** Active operators, for choosing who ran a shift. */
export function useOperators() {
  return useQuery({
    queryKey: ['users', 'operators'],
    queryFn: () => unwrap(api.GET('/users/operators')),
  });
}

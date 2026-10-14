import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';

/** The details printed at the top of each delivery challan. */
export function useCompany() {
  return useQuery({
    queryKey: ['settings', 'company'],
    queryFn: () => unwrap(api.GET('/settings/company')),
  });
}

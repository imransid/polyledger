import { useQuery } from '@tanstack/react-query';
import { canEditMasterData } from '@/auth/permissions';
import { useUser } from '@/auth/use-session';

/** One record, or nothing while creating a new one (id "new"). */
export function useRecord<T>(
  queryKey: string,
  id: string,
  load: (id: string) => Promise<T>,
) {
  return useQuery({
    queryKey: [queryKey, 'record', id],
    queryFn: () => load(id),
    enabled: id !== 'new',
  });
}

export function useCanEdit(): boolean {
  return canEditMasterData(useUser().role);
}

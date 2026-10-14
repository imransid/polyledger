import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';

export function useChallan(id: string) {
  return useQuery({
    queryKey: ['dispatch', 'challan', id],
    queryFn: () =>
      unwrap(api.GET('/dispatch/challans/{id}', { params: { path: { id } } })),
  });
}

export function totalPieces(lines: { pieces: number }[]): number {
  return lines.reduce((sum, line) => sum + line.pieces, 0);
}

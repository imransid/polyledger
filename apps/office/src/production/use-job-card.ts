import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';

export function useCardSummary(cardId: string, enabled = true) {
  return useQuery({
    queryKey: ['job-cards', 'summary', cardId],
    enabled,
    queryFn: () =>
      unwrap(
        api.GET('/job-cards/{id}/summary', {
          params: { path: { id: cardId } },
        }),
      ),
  });
}

export function useCardEntries(cardId: string, enabled = true) {
  return useQuery({
    queryKey: ['job-cards', 'entries', cardId],
    enabled,
    queryFn: () =>
      unwrap(
        api.GET('/job-cards/{id}/entries', {
          params: { path: { id: cardId } },
        }),
      ),
  });
}

import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

// One Idempotency-Key per form or action: a double click, or a retry after
// a lost answer, sends the same key and the API records the write once.
export function useWrite(...refreshes: string[]) {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all(
      refreshes.map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
  return {
    headers: { 'Idempotency-Key': key },
    /** The form stays open, so its next save is a new write. */
    async done() {
      setKey(crypto.randomUUID());
      await refresh();
    },
    // A create form stands for one record. It keeps its key while it leaves
    // (navigation is a transition, so it stays clickable for a moment): a
    // late second click repeats the same create and gets the same record.
    async created() {
      await refresh();
    },
  };
}

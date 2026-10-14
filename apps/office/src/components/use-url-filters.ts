import { useSearchParams } from 'react-router';

// Filters and the page live in the URL, so Back returns to the same view and
// a filtered list can be shared as a link.
export function useUrlFilters() {
  const [params, setParams] = useSearchParams();
  return {
    value: (name: string, fallback = '') => params.get(name) ?? fallback,
    page: Math.max(1, Number(params.get('page')) || 1),
    /** A new filter starts again from page 1. */
    change(name: string, value: string) {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set(name, value);
          if (name !== 'page') {
            next.delete('page');
          }
          return next;
        },
        { replace: true },
      );
    },
  };
}

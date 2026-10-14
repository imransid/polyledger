import { Button } from '@/components/ui/button';
import { text } from '@/i18n';

interface PagerProps {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}

export function Pager({ page, pages, onPage }: PagerProps) {
  if (pages <= 1) {
    return null;
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        {text.list.previous}
      </Button>
      <span>{text.list.page(page, pages)}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        {text.list.next}
      </Button>
    </div>
  );
}

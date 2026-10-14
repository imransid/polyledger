import { Link } from 'react-router';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { text } from '@/i18n';

export function DocumentLink({ id, number }: { id: string; number: string }) {
  return (
    <Link
      to={`/stock/documents/${id}`}
      className="font-medium underline-offset-4 hover:underline"
    >
      {number}
    </Link>
  );
}

/** "GRN-000123 posted." after a posting, linking to the new document. */
export function PostedNotice({
  document,
}: {
  document?: { id: string; number: string };
}) {
  if (!document) {
    return null;
  }
  return (
    <Alert>
      <AlertDescription>
        <span>
          <DocumentLink {...document} /> {text.stock.posted}
        </span>
      </AlertDescription>
    </Alert>
  );
}

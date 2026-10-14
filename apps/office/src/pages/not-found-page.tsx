import { text } from '@/i18n';

export function NotFoundPage() {
  return <p className="text-muted-foreground">{text.errors.notFound}</p>;
}

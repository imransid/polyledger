import { text } from '@/i18n';

/** Stands in for an area whose screens come in a later step. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="grid gap-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{text.notBuiltYet}</p>
    </div>
  );
}

import { type ComponentProps, useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type TextFieldProps = ComponentProps<'input'> & {
  label: string;
  error?: string;
  hint?: string;
};

export function TextField({ label, error, hint, ...input }: TextFieldProps) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={error ? true : undefined} {...input} />
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

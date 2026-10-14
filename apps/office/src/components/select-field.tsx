import { type ComponentProps, useId } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type SelectFieldProps = ComponentProps<'select'> & {
  label: string;
  error?: string;
  options: { value: string; label: string }[];
};

// A native select: dependable with a keyboard and on any browser the
// office has.
export function SelectField({
  label,
  error,
  options,
  className,
  ...select
}: SelectFieldProps) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className={cn(
          'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive',
          className,
        )}
        {...select}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

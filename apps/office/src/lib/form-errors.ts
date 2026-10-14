import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { text } from '@/i18n';

// Invalid input comes back from the API as "field: problem" lines. Each one
// goes next to its field when the form shows that field, and anything else
// (a duplicate code, a rule about the record) at the top of the form.
export function showApiError<Values extends FieldValues, Context, Output>(
  form: UseFormReturn<Values, Context, Output>,
  error: unknown,
  fields: Partial<Record<string, Path<Values>>>,
): void {
  const message =
    error instanceof Error ? error.message : text.errors.unexpected;
  const general: string[] = [];
  for (const line of message.split('\n')) {
    const [, apiField, problem] = /^(\w+)[\w.]*: (.+)$/.exec(line) ?? [];
    const field = apiField ? fields[apiField] : undefined;
    if (field) {
      form.setError(field, { message: problem });
    } else {
      general.push(line);
    }
  }
  if (general.length > 0) {
    form.setError('root', { message: general.join('\n') });
  }
}
